import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import type { SessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { ComposerAction } from '../host/composerAction.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { composerAtom, createComposerAtoms } from './composer.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { CODEX, freshRegistry, gated, installFakeAgent, setPhase } from './fakeAgent.testing.ts';
import { handoffInProgressAtom } from './handoff.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { ensureVirtual, select, setVirtualLaunchTarget, virtualSessionAtom } from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

const steeringInitializeResult = { _meta: { steering: { supported: true } } };

const image = (id: string): ComposerImageAttachment => ({
  byteLength: 4,
  id,
  mimeType: 'image/png',
  name: `${id}.png`,
  previewDataUrl: 'data:image/png;base64,AAAA',
  uri: `file:///tmp/${id}.png`,
});

/** Fake agent + registry with Codex `ready`, Steering supported, and active Sessions `ids`; `s1` Selected. */
const harness = (opts: FakeAgentOpts = {}, ids: readonly string[] = ['s1']) =>
  Effect.gen(function* () {
    const calls: string[] = [];
    yield* installFakeAgent(calls, opts);
    const registry = yield* freshRegistry;
    const runtime = createHostRuntime(mockHostLayer);
    const { editComposerAtomFn, submitComposerAtomFn } = createComposerAtoms(runtime);
    registry.mount(editComposerAtomFn);
    registry.mount(submitComposerAtomFn);
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      initializeResult: steeringInitializeResult,
      phase: 'ready',
      sessions: Object.fromEntries(ids.map(id => [id, initialSessionSnapshot(id, 'active')])),
    }));
    yield* select(registry, { _tag: 'Session', sessionId: 's1' });
    const edit = (patch: { readonly attachments?: readonly ComposerImageAttachment[]; readonly draft?: string }) =>
      runAtomFn(registry, editComposerAtomFn, patch);
    /** Fire a submit without waiting for it (the Composer stays usable while it runs). */
    const startSubmit = () => {
      registry.set(submitComposerAtomFn, undefined);
    };
    /** Outcome of the submit(s) in flight. */
    const submitResult = Effect.exit(
      AtomRegistry.getResult(registry, submitComposerAtomFn, { suspendOnWaiting: true }),
    );
    const submit = Effect.suspend(() => {
      startSubmit();
      return submitResult;
    });
    return { calls, edit, registry, startSubmit, submit, submitResult };
  });

const patchSession = (registry: Registry, sessionId: string, patch: Partial<SessionSnapshot>) => {
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessions: { ...current.sessions, [sessionId]: { ...current.sessions[sessionId], ...patch } },
  }));
};

const userMessages = (registry: Registry, sessionId: string) =>
  registry
    .get(backendHarnessSnapshotAtom(CODEX))
    .sessions[sessionId].transcript.items.flatMap(item =>
      item.kind === 'user_message' ? [{ steering: item.steering === true, text: item.text }] : [],
    );

/** Let forked fibers run to their next real wait. */
const settle = Effect.repeat(Effect.yieldNow, { times: 50 });

const pendingPermission = { request: {}, resolve: () => undefined } as unknown as SessionSnapshot['pendingPermission'];

describe('Composer action and submit agree', () => {
  type Row = {
    readonly action: ComposerAction;
    readonly calls: readonly string[];
    readonly draftAfter: string;
    readonly messages: readonly { readonly steering: boolean; readonly text: string }[];
    readonly name: string;
    readonly seed: (registry: Registry) => void;
  };
  const noop = { calls: [], draftAfter: 'hello', messages: [] };
  const rows: readonly Row[] = [
    {
      action: { _tag: 'Send' },
      calls: ['prompt:s1'],
      draftAfter: '',
      messages: [{ steering: false, text: 'hello' }],
      name: 'idle Session sends a prompt and clears the draft',
      seed: () => undefined,
    },
    {
      action: { _tag: 'Steer' },
      calls: ['steer:s1'],
      draftAfter: '',
      messages: [{ steering: true, text: 'hello' }],
      name: 'prompt in flight with Steering supported steers and clears the draft',
      seed: registry => {
        patchSession(registry, 's1', { pendingClientRequest: 'prompt' });
      },
    },
    {
      ...noop,
      action: { _tag: 'CancelTurn' },
      name: 'prompt in flight without Steering supported: submit never cancels',
      seed: registry => {
        patchSession(registry, 's1', { pendingClientRequest: 'prompt' });
        updateHarnessSnapshot(registry, CODEX, current => ({ ...current, initializeResult: {} }));
      },
    },
    {
      ...noop,
      action: { _tag: 'CancelTurn' },
      name: 'Prompt turn cancel requested: submit never steers into a dying turn',
      seed: registry => {
        patchSession(registry, 's1', { pendingClientRequest: 'prompt', promptCancelRequested: true });
      },
    },
    {
      ...noop,
      action: { _tag: 'Unavailable', reason: 'PendingClientRequest' },
      name: 'config pending: no-op',
      seed: registry => {
        patchSession(registry, 's1', { pendingClientRequest: 'config' });
      },
    },
    {
      ...noop,
      action: { _tag: 'Unavailable', reason: 'PendingInteraction' },
      name: 'Pending interaction: no-op',
      seed: registry => {
        patchSession(registry, 's1', { pendingPermission });
      },
    },
    {
      ...noop,
      action: { _tag: 'Unavailable', reason: 'NotActive' },
      name: 'inactive Session: no-op',
      seed: registry => {
        patchSession(registry, 's1', { status: 'inactive' });
      },
    },
    {
      ...noop,
      action: { _tag: 'Unavailable', reason: 'Locked' },
      name: 'Handoff running: no-op',
      seed: registry => {
        registry.set(handoffInProgressAtom, true);
      },
    },
  ];

  for (const row of rows) {
    it.effect(row.name, () =>
      Effect.gen(function* () {
        const h = yield* harness();
        yield* h.edit({ draft: 'hello' });
        row.seed(h.registry);

        assert.deepStrictEqual(h.registry.get(composerAtom).action, row.action);
        const exit = yield* h.submit;

        assert.isTrue(Exit.isSuccess(exit));
        assert.deepStrictEqual(h.calls, row.calls);
        assert.deepStrictEqual(userMessages(h.registry, 's1'), row.messages);
        assert.strictEqual(h.registry.get(composerAtom).draft, row.draftAfter);
      }).pipe(Effect.scoped),
    );
  }

  it.effect('Steering that reports promptRequired falls back to a prompt', () =>
    Effect.gen(function* () {
      const h = yield* harness({
        // The turn already ended: its `session/prompt` response clears the Pending client request.
        duringSteering: Effect.suspend(() => {
          patchSession(h.registry, 's1', { pendingClientRequest: undefined });
          return Effect.void;
        }),
        steering: 'promptRequired',
      });
      yield* h.edit({ draft: 'hello' });
      patchSession(h.registry, 's1', { pendingClientRequest: 'prompt' });

      const exit = yield* h.submit;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(h.calls, ['steer:s1', 'prompt:s1']);
      assert.deepStrictEqual(userMessages(h.registry, 's1'), [{ steering: false, text: 'hello' }]);
    }).pipe(Effect.scoped),
  );
});

describe('Draft during turn: failed Steering restores the draft (bug A)', () => {
  it.effect('restores ahead of text and attachments typed since', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringSteering: gate.during, steering: 'fail' });
      yield* h.edit({ attachments: [image('a')], draft: 'steered' });
      patchSession(h.registry, 's1', { pendingClientRequest: 'prompt' });

      h.startSubmit();
      yield* gate.started;
      assert.strictEqual(h.registry.get(composerAtom).draft, '');
      yield* h.edit({ attachments: [image('b')], draft: 'typed since' });
      yield* gate.release;
      const exit = yield* h.submitResult;

      assert.isTrue(Exit.isFailure(exit));
      const composer = h.registry.get(composerAtom);
      assert.strictEqual(composer.draft, 'steered\ntyped since');
      assert.deepStrictEqual(
        composer.attachments.map(attachment => attachment.id),
        ['a', 'b'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('restores into the steered Session after Selected moves to another Session', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringSteering: gate.during, steering: 'fail' }, ['s1', 's2']);
      yield* h.edit({ draft: 'steered' });
      patchSession(h.registry, 's1', { pendingClientRequest: 'prompt' });

      h.startSubmit();
      yield* gate.started;
      yield* select(h.registry, { _tag: 'Session', sessionId: 's2' });
      yield* h.edit({ attachments: [image('s2')], draft: 'on s2' });
      yield* gate.release;
      yield* h.submitResult;

      assert.strictEqual(h.registry.get(composerAtom).draft, 'on s2');
      assert.deepStrictEqual(
        h.registry.get(composerAtom).attachments.map(attachment => attachment.id),
        ['s2'],
      );
      yield* select(h.registry, { _tag: 'Session', sessionId: 's1' });
      assert.strictEqual(h.registry.get(composerAtom).draft, 'steered');
      assert.deepStrictEqual(h.registry.get(composerAtom).attachments, []);
    }).pipe(Effect.scoped),
  );
});

describe('a later submit never interrupts an earlier one (bug B)', () => {
  it.effect("Send on s2 does not interrupt s1's prompt turn (B1)", () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during }, ['s1', 's2']);
      yield* h.edit({ draft: 'one' });
      h.startSubmit();
      yield* gate.started;

      yield* select(h.registry, { _tag: 'Session', sessionId: 's2' });
      yield* h.edit({ draft: 'two' });
      h.startSubmit();
      yield* settle;

      assert.strictEqual(h.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1.pendingClientRequest, 'prompt');
      yield* gate.release;
      yield* h.submitResult;
      assert.deepStrictEqual(h.calls.toSorted(), ['prompt:s1', 'prompt:s2']);
      assert.isUndefined(h.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1.pendingClientRequest);
    }).pipe(Effect.scoped),
  );

  it.effect('two quick Steers both land (B2)', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringSteering: gate.during });
      patchSession(h.registry, 's1', { pendingClientRequest: 'prompt' });
      yield* h.edit({ draft: 'one' });
      h.startSubmit();
      yield* gate.started;
      yield* h.edit({ draft: 'two' });
      h.startSubmit();
      yield* gate.release;
      yield* h.submitResult;
      yield* settle;

      assert.deepStrictEqual(
        userMessages(h.registry, 's1')
          .map(message => message.text)
          .toSorted(),
        ['one', 'two'],
      );
    }).pipe(Effect.scoped),
  );
});

describe('Virtual', () => {
  it.effect('Send Materializes the Virtual session, then prompts it', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      setPhase(h.registry, CODEX, 'connecting');
      yield* ensureVirtual(h.registry, { cwd: '/proj' });
      yield* setVirtualLaunchTarget(h.registry, CODEX);
      setPhase(h.registry, CODEX, 'ready');
      yield* h.edit({ draft: 'hello' });
      assert.deepStrictEqual(h.registry.get(composerAtom).action, { _tag: 'Send' });

      const exit = yield* h.submit;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(h.calls, ['new', 'prompt:bound-1']);
      assert.deepStrictEqual(h.registry.get(selectedAtom), { _tag: 'Session', sessionId: 'bound-1' });
      assert.deepStrictEqual(userMessages(h.registry, 'bound-1'), [{ steering: false, text: 'hello' }]);
    }).pipe(Effect.scoped),
  );
});

describe('edits route per Selected target', () => {
  it.effect('Virtual edits land on the Virtual session; each Session keeps its own draft', () =>
    Effect.gen(function* () {
      const h = yield* harness({}, ['s1', 's2']);
      yield* h.edit({ draft: 'on s1' });
      yield* select(h.registry, { _tag: 'Session', sessionId: 's2' });
      assert.strictEqual(h.registry.get(composerAtom).draft, '');
      yield* h.edit({ attachments: [image('x')], draft: 'on s2' });

      yield* ensureVirtual(h.registry, { cwd: '/proj' });
      yield* h.edit({ draft: 'on virtual' });
      assert.strictEqual(h.registry.get(virtualSessionAtom)?.draft, 'on virtual');
      assert.strictEqual(h.registry.get(composerAtom).draft, 'on virtual');

      yield* select(h.registry, { _tag: 'Session', sessionId: 's1' });
      assert.strictEqual(h.registry.get(composerAtom).draft, 'on s1');
      yield* select(h.registry, { _tag: 'Session', sessionId: 's2' });
      assert.strictEqual(h.registry.get(composerAtom).draft, 'on s2');
      assert.deepStrictEqual(
        h.registry.get(composerAtom).attachments.map(attachment => attachment.id),
        ['x'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('with nothing Selected an edit does nothing', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      yield* select(h.registry, undefined);
      yield* h.edit({ draft: 'lost' });
      assert.strictEqual(h.registry.get(composerAtom).draft, '');
      assert.isUndefined(h.registry.get(composerAtom).target);
      yield* select(h.registry, { _tag: 'Session', sessionId: 's1' });
      assert.strictEqual(h.registry.get(composerAtom).draft, '');
    }).pipe(Effect.scoped),
  );
});

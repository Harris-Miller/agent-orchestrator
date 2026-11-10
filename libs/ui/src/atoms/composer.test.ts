import { assert, describe, it } from '@effect/vitest';
import { FileDialog } from '@lib/context-services';
import { Deferred, Effect, Exit, Layer, Option } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import type { FileSystem } from 'effect/FileSystem';
import { systemError } from 'effect/PlatformError';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import type { SessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { NO_AGENT_CAPABILITIES } from '../host/agentCapabilities.ts';
import type { ComposerAction } from '../host/composerAction.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import { ImageAttachmentRejected } from '../host/composerImageAttachment.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { composerAtom, createComposerAtoms } from './composer.atoms.ts';
import type { ComposerImageSource } from './composer.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { CODEX, freshRegistry, gated, installFakeAgent, setPhase } from './fakeAgent.testing.ts';
import { handoffInProgressAtom } from './handoff.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { ComposerActionUnavailable, SteerFallbackTurnFailed } from './promptTurn.ts';
import { runAtomFn } from './runAtomFn.ts';
import { userSettingsDocumentAtom } from './userSettings/userSettingsDocument.atoms.ts';
import type { MidTurnSend } from './userSettings/userSettingsDocument.atoms.ts';
import {
  discardVirtual,
  ensureVirtual,
  select,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

const steeringCapabilities = { ...NO_AGENT_CAPABILITIES, steeringSupported: true };

const image = (id: string): ComposerImageAttachment => ({
  byteLength: 4,
  id,
  mimeType: 'image/png',
  name: `${id}.png`,
  previewDataUrl: 'data:image/png;base64,AAAA',
  uri: `file:///tmp/${id}.png`,
});

/** Fake agent + registry with Codex `ready`, Steering supported, and active Sessions `ids`; `s1` Selected. */
const harness = (
  opts: FakeAgentOpts = {},
  ids: readonly string[] = ['s1'],
  /** Host services merged over `mockHostLayer` (the later layer wins). */
  host?: Layer.Layer<FileDialog | FileSystem>,
) =>
  Effect.gen(function* () {
    const calls: string[] = [];
    yield* installFakeAgent(calls, opts);
    const registry = yield* freshRegistry;
    const runtime = createHostRuntime(host === undefined ? mockHostLayer : Layer.merge(mockHostLayer, host));
    const { attachComposerImagesAtomFn, editComposerAtomFn, submitComposerAtomFn, unqueueComposerAtomFn } =
      createComposerAtoms(runtime);
    registry.mount(attachComposerImagesAtomFn);
    registry.mount(editComposerAtomFn);
    registry.mount(submitComposerAtomFn);
    registry.mount(unqueueComposerAtomFn);
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      agentCapabilities: steeringCapabilities,
      phase: 'ready',
      sessions: Object.fromEntries(ids.map(id => [id, initialSessionSnapshot(id, 'active')])),
    }));
    yield* select(registry, { _tag: 'Session', sessionId: 's1' });
    const edit = (patch: { readonly attachments?: readonly ComposerImageAttachment[]; readonly draft?: string }) =>
      runAtomFn(registry, editComposerAtomFn, patch);
    /** Fire a submit without waiting for it (the Composer stays usable while it runs). */
    const startSubmit = (mode?: MidTurnSend) => {
      registry.set(submitComposerAtomFn, mode);
    };
    const unqueue = runAtomFn(registry, unqueueComposerAtomFn, undefined);
    /** Outcome of the submit(s) in flight. */
    const submitResult = Effect.exit(
      AtomRegistry.getResult(registry, submitComposerAtomFn, { suspendOnWaiting: true }),
    );
    const submit = Effect.suspend(() => {
      startSubmit();
      return submitResult;
    });
    /** Start an attachment edit without waiting for it. */
    const startAttach = (source: ComposerImageSource) => {
      registry.set(attachComposerImagesAtomFn, source);
    };
    /** Outcome of the attachment edit(s) in flight; await only when no other attach is still gated. */
    const attachResult = Effect.exit(
      AtomRegistry.getResult(registry, attachComposerImagesAtomFn, { suspendOnWaiting: true }),
    );
    const attach = (source: ComposerImageSource) =>
      Effect.suspend(() => {
        startAttach(source);
        return attachResult;
      });
    return { attach, attachResult, calls, edit, registry, startAttach, startSubmit, submit, submitResult, unqueue };
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
        updateHarnessSnapshot(registry, CODEX, current => ({ ...current, agentCapabilities: NO_AGENT_CAPABILITIES }));
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

  it.effect('a fallback Send that began and then failed keeps the message and does not restore the draft', () =>
    Effect.gen(function* () {
      const h = yield* harness({
        duringSteering: Effect.suspend(() => {
          patchSession(h.registry, 's1', { pendingClientRequest: undefined });
          return Effect.void;
        }),
        prompt: 'fail',
        steering: 'promptRequired',
      });
      yield* h.edit({ draft: 'hello' });
      patchSession(h.registry, 's1', { pendingClientRequest: 'prompt' });

      const exit = yield* h.submit;

      assert.instanceOf(Option.getOrUndefined(Exit.findErrorOption(exit)), SteerFallbackTurnFailed);
      assert.deepStrictEqual(h.calls, ['steer:s1', 'prompt:s1']);
      assert.deepStrictEqual(userMessages(h.registry, 's1'), [{ steering: false, text: 'hello' }]);
      assert.strictEqual(h.registry.get(composerAtom).draft, '');
    }).pipe(Effect.scoped),
  );
});

describe('a refused Send gives the draft back', () => {
  it.effect('when Bootstrap is not usable (the Composer still offers Send)', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      yield* h.edit({ draft: 'hello' });
      setPhase(h.registry, CODEX, 'initialized');
      assert.deepStrictEqual(h.registry.get(composerAtom).action, { _tag: 'Send' });

      const exit = yield* h.submit;

      assert.instanceOf(Option.getOrUndefined(Exit.findErrorOption(exit)), ComposerActionUnavailable);
      assert.deepStrictEqual(h.calls, []);
      assert.deepStrictEqual(userMessages(h.registry, 's1'), []);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'hello');
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

/**
 * Host fakes for attachment edits: a FileDialog that waits for `resolveDialog`, and a FileSystem whose `readFile`
 * returns 4 bytes, fails for `/tmp/missing.png`, and waits for `releaseSlow` on `/tmp/slow.png`.
 */
const imageHost = Effect.gen(function* () {
  const dialog = yield* Deferred.make<readonly string[]>();
  const slow = yield* Deferred.make<undefined>();
  let pickCount = 0;
  const layer = Layer.merge(
    Layer.succeed(FileDialog, {
      pickFiles: () =>
        Effect.sync(() => {
          pickCount += 1;
        }).pipe(Effect.andThen(Deferred.await(dialog))),
    }),
    layerNoop({
      readFile: path =>
        path === '/tmp/missing.png'
          ? Effect.fail(
              systemError({ _tag: 'NotFound', method: 'readFile', module: 'FileSystem', pathOrDescriptor: path }),
            )
          : (path === '/tmp/slow.png' ? Deferred.await(slow) : Effect.void).pipe(
              Effect.as(new Uint8Array([1, 2, 3, 4])),
            ),
    }),
  );
  return {
    layer,
    pickCount: () => pickCount,
    releaseSlow: Deferred.succeed(slow, undefined),
    resolveDialog: (paths: readonly string[]) => Deferred.succeed(dialog, paths),
  };
});

const uris = (attachments: readonly ComposerImageAttachment[]) => attachments.map(attachment => attachment.uri);
const uri = (name: string) => `file:///tmp/${name}.png`;

describe('an attachment edit lands on the Composer it started on', () => {
  it.effect('Pick appends to the Selected Session attachments (C1)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* h.edit({ attachments: [image('a')] });

      h.startAttach({ _tag: 'Pick' });
      yield* host.resolveDialog(['/tmp/p.png']);
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      const { attachments } = h.registry.get(composerAtom);
      assert.deepStrictEqual(uris(attachments), [uri('a'), uri('p')]);
      assert.strictEqual(attachments[1]?.name, 'p.png');
      assert.strictEqual(attachments[1]?.mimeType, 'image/png');
      assert.strictEqual(attachments[1]?.previewDataUrl, 'data:image/png;base64,AQIDBA==');
    }).pipe(Effect.scoped),
  );

  it.effect('Selected moves mid-pick: the images land on the Session the pick started on (C2)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1', 's2'], host.layer);

      h.startAttach({ _tag: 'Pick' });
      yield* settle;
      yield* select(h.registry, { _tag: 'Session', sessionId: 's2' });
      yield* h.edit({ attachments: [image('x')], draft: 'on s2' });
      yield* host.resolveDialog(['/tmp/p.png']);
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), [uri('x')]);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'on s2');
      yield* select(h.registry, { _tag: 'Session', sessionId: 's1' });
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), [uri('p')]);
    }).pipe(Effect.scoped),
  );

  it.effect('attachments edited mid-pick are kept: the images merge onto the latest list (C3)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* h.edit({ attachments: [image('a'), image('b')] });

      h.startAttach({ _tag: 'Pick' });
      yield* settle;
      yield* h.edit({ attachments: [image('b'), image('c')] });
      yield* host.resolveDialog(['/tmp/p.png']);
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), [uri('b'), uri('c'), uri('p')]);
    }).pipe(Effect.scoped),
  );

  it.effect('Virtual: the images land on the Virtual session after Leaving Virtual (C4)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* ensureVirtual(h.registry, { cwd: '/proj' });
      yield* h.edit({ draft: 'keep' });

      h.startAttach({ _tag: 'Pick' });
      yield* settle;
      yield* select(h.registry, { _tag: 'Session', sessionId: 's1' });
      yield* host.resolveDialog(['/tmp/p.png']);
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(uris(h.registry.get(virtualSessionAtom)?.attachments ?? []), [uri('p')]);
      assert.deepStrictEqual(h.registry.get(composerAtom).attachments, []);
    }).pipe(Effect.scoped),
  );

  it.effect('overlapping attaches both land; the later writes its images without waiting on the earlier (C5)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);

      h.startAttach({ _tag: 'Paths', paths: ['/tmp/slow.png'] });
      yield* settle;
      h.startAttach({ _tag: 'Paths', paths: ['/tmp/fast.png'] });
      yield* settle;
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), [uri('fast')]);

      yield* host.releaseSlow;
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), [uri('fast'), uri('slow')]);
    }).pipe(Effect.scoped),
  );

  it.effect('a cancelled dialog changes nothing (C6)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* h.edit({ attachments: [image('a')], draft: 'hello' });

      h.startAttach({ _tag: 'Pick' });
      yield* host.resolveDialog([]);
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), [uri('a')]);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'hello');
    }).pipe(Effect.scoped),
  );

  it.effect('an image already attached (same uri) adds nothing (C7)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* h.edit({ attachments: [image('p')] });

      const exit = yield* h.attach({ _tag: 'Paths', paths: ['/tmp/p.png'] });

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(
        h.registry.get(composerAtom).attachments.map(attachment => attachment.id),
        ['p'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('the count cap is judged on the latest list (C8)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      const nine = Array.from({ length: 9 }, (_, index) => image(`i${String(index)}`));
      yield* h.edit({ attachments: nine });

      h.startAttach({ _tag: 'Pick' });
      yield* settle;
      yield* h.edit({ attachments: [...nine, image('tenth')] });
      yield* host.resolveDialog(['/tmp/p.png']);
      const exit = yield* h.attachResult;

      assert.instanceOf(Option.getOrUndefined(Exit.findErrorOption(exit)), ImageAttachmentRejected);
      assert.strictEqual(h.registry.get(composerAtom).attachments.length, 10);
      assert.notInclude(uris(h.registry.get(composerAtom).attachments), uri('p'));
    }).pipe(Effect.scoped),
  );

  it.effect('the cap is judged again on the merged list once the files are read (C13)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      const nine = Array.from({ length: 9 }, (_, index) => image(`i${String(index)}`));
      yield* h.edit({ attachments: nine });

      h.startAttach({ _tag: 'Paths', paths: ['/tmp/slow.png'] });
      yield* settle;
      const ten = [...nine, image('tenth')];
      yield* h.edit({ attachments: ten });
      yield* host.releaseSlow;
      const exit = yield* h.attachResult;

      assert.instanceOf(Option.getOrUndefined(Exit.findErrorOption(exit)), ImageAttachmentRejected);
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), uris(ten));
    }).pipe(Effect.scoped),
  );

  it.effect('an unreadable path rejects the whole batch (C9)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* h.edit({ attachments: [image('a')] });

      const exit = yield* h.attach({ _tag: 'Paths', paths: ['/tmp/ok.png', '/tmp/missing.png'] });

      assert.instanceOf(Option.getOrUndefined(Exit.findErrorOption(exit)), ImageAttachmentRejected);
      assert.deepStrictEqual(uris(h.registry.get(composerAtom).attachments), [uri('a')]);
    }).pipe(Effect.scoped),
  );

  it.effect('with nothing Selected no dialog opens (C10)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* select(h.registry, undefined);

      const exit = yield* h.attach({ _tag: 'Pick' });

      assert.isTrue(Exit.isSuccess(exit));
      assert.strictEqual(host.pickCount(), 0);
    }).pipe(Effect.scoped),
  );

  it.effect('a Virtual session discarded mid-pick drops the images (C11)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* ensureVirtual(h.registry, { cwd: '/proj' });
      yield* h.edit({ draft: 'keep' });

      h.startAttach({ _tag: 'Pick' });
      yield* settle;
      yield* discardVirtual(h.registry);
      yield* host.resolveDialog(['/tmp/p.png']);
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      assert.isNull(h.registry.get(virtualSessionAtom));
      yield* select(h.registry, { _tag: 'Session', sessionId: 's1' });
      assert.deepStrictEqual(h.registry.get(composerAtom).attachments, []);
    }).pipe(Effect.scoped),
  );

  it.effect('a Virtual session replaced by a new one mid-pick drops the images (C14)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      yield* ensureVirtual(h.registry, { cwd: '/proj' });
      yield* h.edit({ draft: 'keep' });

      h.startAttach({ _tag: 'Pick' });
      yield* settle;
      yield* discardVirtual(h.registry);
      yield* ensureVirtual(h.registry, { cwd: '/proj' });
      yield* host.resolveDialog(['/tmp/p.png']);
      const exit = yield* h.attachResult;

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(h.registry.get(virtualSessionAtom)?.attachments, []);
      assert.deepStrictEqual(h.registry.get(composerAtom).attachments, []);
    }).pipe(Effect.scoped),
  );

  it.effect('image paths have no early count check: a duplicate at the cap is a no-op (C12)', () =>
    Effect.gen(function* () {
      const host = yield* imageHost;
      const h = yield* harness({}, ['s1'], host.layer);
      const ten = [...Array.from({ length: 9 }, (_, index) => image(`i${String(index)}`)), image('p')];
      yield* h.edit({ attachments: ten });

      const exit = yield* h.attach({ _tag: 'Paths', paths: ['/tmp/p.png'] });

      assert.isTrue(Exit.isSuccess(exit));
      assert.deepStrictEqual(
        h.registry.get(composerAtom).attachments.map(attachment => attachment.id),
        ten.map(attachment => attachment.id),
      );
    }).pipe(Effect.scoped),
  );
});

describe('Queue: a Queued message is sent as a new Prompt turn once the in-flight one is over', () => {
  /** A Session with a turn in flight and `draft` typed, ready to Queue. */
  const inFlight = (draft: string, opts: FakeAgentOpts = {}) =>
    Effect.gen(function* () {
      const h = yield* harness(opts);
      yield* h.edit({ draft });
      patchSession(h.registry, 's1', { pendingClientRequest: 'prompt' });
      return h;
    });
  const endTurn = (h: { readonly registry: Registry }) =>
    Effect.gen(function* () {
      patchSession(h.registry, 's1', { pendingClientRequest: undefined });
      yield* settle;
    });

  it.effect('sends after the turn ends and clears the Queued message', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('hello');

      h.startSubmit('queue');
      yield* settle;

      assert.deepStrictEqual(h.calls, []);
      assert.strictEqual(h.registry.get(composerAtom).draft, '');
      assert.strictEqual(h.registry.get(composerAtom).queued?.draft, 'hello');

      yield* endTurn(h);

      assert.deepStrictEqual(h.calls, ['prompt:s1']);
      assert.deepStrictEqual(userMessages(h.registry, 's1'), [{ steering: false, text: 'hello' }]);
      assert.isUndefined(h.registry.get(composerAtom).queued);
    }).pipe(Effect.scoped),
  );

  it.effect('a second Queue merges into the Queued message and sends once', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('a');
      h.startSubmit('queue');
      yield* h.edit({ draft: 'b' });
      h.startSubmit('queue');
      yield* settle;

      assert.strictEqual(h.registry.get(composerAtom).queued?.draft, 'a\nb');

      yield* endTurn(h);

      assert.deepStrictEqual(h.calls, ['prompt:s1']);
      assert.deepStrictEqual(userMessages(h.registry, 's1'), [{ steering: false, text: 'a\nb' }]);
    }).pipe(Effect.scoped),
  );

  it.effect('unqueue puts the message back ahead of the draft and nothing is sent', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('hello');
      h.startSubmit('queue');
      yield* settle;
      yield* h.edit({ draft: 'typed since' });

      yield* h.unqueue;
      yield* endTurn(h);

      assert.deepStrictEqual(h.calls, []);
      assert.isUndefined(h.registry.get(composerAtom).queued);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'hello\ntyped since');
    }).pipe(Effect.scoped),
  );

  it.effect('a refused Send gives the Queued message back to the draft', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('hello');
      h.startSubmit('queue');
      yield* settle;
      setPhase(h.registry, CODEX, 'initialized');

      yield* endTurn(h);

      assert.deepStrictEqual(h.calls, []);
      assert.isUndefined(h.registry.get(composerAtom).queued);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'hello');
    }).pipe(Effect.scoped),
  );

  it.effect('a Session that goes inactive gives the Queued message back to the draft', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('hello');
      h.startSubmit('queue');
      yield* settle;

      patchSession(h.registry, 's1', { status: 'inactive' });
      yield* settle;

      assert.deepStrictEqual(h.calls, []);
      assert.isUndefined(h.registry.get(composerAtom).queued);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'hello');
    }).pipe(Effect.scoped),
  );

  it.effect('the midTurnSend setting picks the default; an explicit mode overrides it', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('hello');
      assert.strictEqual(h.registry.get(composerAtom).midTurnSend, 'steer');

      h.registry.set(userSettingsDocumentAtom, AsyncResult.success({ midTurnSend: 'queue' }));
      assert.strictEqual(h.registry.get(composerAtom).midTurnSend, 'queue');
      h.startSubmit();
      yield* settle;
      assert.strictEqual(h.registry.get(composerAtom).queued?.draft, 'hello');
      assert.deepStrictEqual(h.calls, []);

      yield* h.edit({ draft: 'now' });
      h.startSubmit('steer');
      yield* settle;
      assert.deepStrictEqual(h.calls, ['steer:s1']);
      assert.deepStrictEqual(userMessages(h.registry, 's1'), [{ steering: true, text: 'now' }]);
    }).pipe(Effect.scoped),
  );

  it.effect('Prompt turn cancel puts the Queued message back into the draft before the turn ends', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('hello');
      const { cancelPromptAtomFn } = createChatAtoms(createHostRuntime(mockHostLayer));
      h.registry.mount(cancelPromptAtomFn);
      h.startSubmit('queue');
      yield* settle;

      yield* Effect.exit(runAtomFn(h.registry, cancelPromptAtomFn, { launchTarget: CODEX, sessionId: 's1' }));
      yield* endTurn(h);

      assert.isUndefined(h.registry.get(composerAtom).queued);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'hello');
      assert.deepStrictEqual(userMessages(h.registry, 's1'), []);
    }).pipe(Effect.scoped),
  );

  it.effect('Queue does nothing when Steering is not supported: the draft stays', () =>
    Effect.gen(function* () {
      const h = yield* inFlight('hello');
      updateHarnessSnapshot(h.registry, CODEX, current => ({ ...current, agentCapabilities: NO_AGENT_CAPABILITIES }));

      h.startSubmit('queue');
      yield* settle;

      assert.isUndefined(h.registry.get(composerAtom).queued);
      assert.strictEqual(h.registry.get(composerAtom).draft, 'hello');
    }).pipe(Effect.scoped),
  );
});

/**
 * Spawned subagent sessions: a parent on Codex starts a child on Claude (two fake agents, the real event fold for each
 * target). Driven through `startSpawnedSubagent` and the fold, since no Hub tool exposes it in this file.
 */
import { assert, describe, it } from '@effect/vitest';
import { Notifier } from '@lib/context-services';
import type { HostServices } from '@lib/context-services';
import { Deferred, Effect, Fiber, Layer } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../../createHostRuntime.ts';
import { initialSessionSnapshot } from '../../host/acpSessionBootstrap.ts';
import { configOptionIndexFromProbeResponses } from '../../host/configOptionIndexFixtures.ts';
import { getSubagent, subagentTranscriptItems } from '../../host/subagent.ts';
import { anyPromptTurnWorking } from '../../host/turnActivity.ts';
import type { PendingPermission } from '../../host/pendingInteractions.ts';

import {
  backendHarnessSnapshotAtom,
  configOptionIndexAtom,
  selectedAtom,
  unifiedSessionHistoryAtom,
} from '../backendState.atoms.ts';
import { createChatAtoms } from '../chat.atoms.ts';
import { advertise, CLAUDE, CODEX, freshRegistry, installFakeAgent, installFakeHub } from '../fakeAgent.testing.ts';
import type { FakeAgentOpts } from '../fakeAgent.testing.ts';
import { makeHarnessEventFold } from '../harnessEventFold.ts';
import { updateHarnessSnapshot } from '../harnessSnapshot.ts';
import { mockHostLayer } from '../mockHostLayer.testing.ts';
import { runAtomFn } from '../runAtomFn.testing.ts';
import { endLink, SpawnSubagentError, startSpawnedSubagent } from './lifecycle.ts';
import { allLinks, slotsInUse } from './links.ts';

const CHILD = 'claude-1';
const PARENT = 'bound-1';

const text = (value: string) => ({ content: { text: value, type: 'text' }, sessionUpdate: 'agent_message_chunk' });

const model = (id: string) => ({
  currentValue: id,
  id: 'model',
  name: 'Model',
  options: [
    { name: 'gpt', value: 'gpt' },
    { name: 'o1', value: 'o1' },
  ],
  type: 'select',
});

const childIndex = configOptionIndexFromProbeResponses('gpt', {
  gpt: { configOptions: [model('gpt')] },
  o1: { configOptions: [model('o1')] },
});

/** The notifications the Harness raised (the Notifier the folds' forked effects run against). */
const notified: { readonly body: string; readonly title: string }[] = [];
const hostLayer = Layer.mergeAll(
  mockHostLayer,
  Layer.succeed(Notifier, {
    isWindowFocused: Effect.succeed(false),
    notify: notification =>
      Effect.sync(() => {
        notified.push({ body: notification.body, title: notification.title });
      }),
    playSound: Effect.void,
    supported: 'os',
  }),
);

/** Poll (yielding, no clock) until `condition` holds. */
const until = (condition: () => boolean) =>
  Effect.yieldNow.pipe(Effect.repeat({ times: 200, until: () => condition() }), Effect.asVoid);

const setup = Effect.fnUntraced(function* (childOpts: FakeAgentOpts = {}) {
  notified.length = 0;
  yield* installFakeHub([]);
  const registry = yield* freshRegistry;
  advertise(registry, CODEX, {});
  advertise(registry, CLAUDE, {});
  registry.set(configOptionIndexAtom(CLAUDE), childIndex);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/w', sessionId: PARENT, title: 'Parent chat' }],
    sessions: { [PARENT]: { ...initialSessionSnapshot(PARENT, 'active'), cwd: '/w' } },
  }));
  const runFork = (effect: Effect.Effect<unknown, never, HostServices>) => {
    Effect.runFork(Effect.provide(effect, hostLayer));
  };
  const childFold = makeHarnessEventFold({
    setModelPickerPrefs: () => undefined,
    launchTarget: CLAUDE,
    registry,
    runFork,
  });
  const childCalls: string[] = [];
  const prompts: string[] = [];
  yield* installFakeAgent(childCalls, { promptTexts: prompts, reports: childFold, ...childOpts }, CLAUDE);
  yield* Effect.addFinalizer(() =>
    Effect.forEach(allLinks(registry), link =>
      endLink(registry, { launchTarget: link.childLaunchTarget, sessionId: link.childSessionId }),
    ),
  );
  const start = (overrides: { configOptions?: Record<string, string | boolean>; task?: string } = {}) =>
    startSpawnedSubagent(registry, {
      configOptions: overrides.configOptions ?? { model: 'o1' },
      description: 'Review the diff',
      launchTarget: CLAUDE,
      parent: { launchTarget: CODEX, sessionId: PARENT },
      task: overrides.task ?? '  Review the diff  ',
    }).pipe(Effect.provide(hostLayer));
  const mirror = () => getSubagent(registry.get(backendHarnessSnapshotAtom(CODEX)).subagents, CHILD);
  const root = () => {
    const { sessions } = registry.get(backendHarnessSnapshotAtom(CLAUDE));
    return CHILD in sessions ? sessions[CHILD] : undefined;
  };
  return { childCalls, childFold, mirror, prompts, registry, root, start };
});

const registryHistory = (registry: AtomRegistry.AtomRegistry) => [
  ...registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessionHistory,
];

describe('startSpawnedSubagent', () => {
  it.effect('binds a root on the child target and mirrors it into the parent with its Work state', () =>
    Effect.gen(function* () {
      let seenMirror: ReturnType<typeof getSubagent>;
      const h = yield* setup({
        duringPrompt: Effect.sync(() => {
          seenMirror = h.mirror();
          h.childFold.onSessionUpdate(CHILD, text('Looks fine.'));
        }),
      });

      const started = yield* h.start();
      const outcome = yield* Deferred.await(started.outcome);

      assert.strictEqual(started.childSessionId, CHILD);
      // A root entry on its own target, in the parent's cwd, with no History row; the Selected session is untouched.
      assert.strictEqual(h.root()?.cwd, '/w');
      assert.deepStrictEqual(registryHistory(h.registry), []);
      assert.isUndefined(h.registry.get(selectedAtom));
      assert.deepStrictEqual(h.childCalls, ['new:claude', 'set:model:o1', `prompt:${CHILD}`]);
      assert.deepStrictEqual(h.prompts, ['Review the diff']);
      // The mirror existed, running, before the child's first prompt reported anything.
      assert.deepStrictEqual(
        [
          seenMirror?.state,
          seenMirror?.kind === 'spawned' ? seenMirror.launchTarget : undefined,
          seenMirror?.name,
          seenMirror?.task,
          seenMirror?.parentSessionId,
        ],
        [{ state: 'running' }, CLAUDE, 'Review the diff', 'Review the diff', PARENT],
      );
      assert.deepStrictEqual(outcome, { status: 'completed', text: 'Looks fine.' });
      assert.deepStrictEqual(h.mirror()?.state, { state: 'completed', stopReason: 'end_turn' });
      const parent = h.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions[PARENT];
      assert.deepStrictEqual(
        parent.transcript.items.map(item => item.kind),
        ['subagent'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('streams updates into the mirror and reports only the last message after the task', () =>
    Effect.gen(function* () {
      const h = yield* setup({
        duringPrompt: Effect.sync(() => {
          h.childFold.onSessionUpdate(CHILD, text('Let me look.'));
          h.childFold.onSessionUpdate(CHILD, {
            sessionUpdate: 'tool_call',
            status: 'completed',
            title: 'Read diff',
            toolCallId: 't1',
          });
          h.childFold.onSessionUpdate(CHILD, text('Final verdict.'));
        }),
      });

      const outcome = yield* Deferred.await((yield* h.start()).outcome);

      assert.deepStrictEqual(outcome, { status: 'completed', text: 'Final verdict.' });
      const mirror = h.mirror();
      assert.isDefined(mirror);
      // The task row is the Subagent view's; the transcript after it is the child's.
      assert.deepStrictEqual(
        subagentTranscriptItems(mirror).map(item => item.kind),
        ['agent_message', 'tool_call', 'agent_message'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('a failed or cancelled turn is a failed or cancelled outcome and Work state', () =>
    Effect.gen(function* () {
      const failed = yield* setup({ prompt: 'fail' });
      const failedOutcome = yield* Deferred.await((yield* failed.start()).outcome);
      assert.strictEqual(failedOutcome.status, 'failed');
      assert.strictEqual(failed.mirror()?.state?.state, 'failed');
    }).pipe(Effect.scoped),
  );

  it.effect('a cancelled stop reason is a cancelled outcome', () =>
    Effect.gen(function* () {
      const h = yield* setup({ prompt: 'cancelled' });
      const outcome = yield* Deferred.await((yield* h.start()).outcome);
      assert.strictEqual(outcome.status, 'cancelled');
      assert.strictEqual(h.mirror()?.state?.state, 'cancelled');
    }).pipe(Effect.scoped),
  );

  it.effect('raises no turn-ended Attention event, and names a pending under its parent chat', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({
        duringPrompt: Effect.suspend(() => {
          h.childFold.onPermissionRequest(CHILD, {} as PendingPermission['request'], () => undefined);
          return Deferred.await(release);
        }),
      });

      const started = yield* h.start();
      yield* until(() => notified.length > 0);
      assert.deepStrictEqual(notified, [{ body: 'Needs permission', title: 'Parent chat · Review the diff' }]);
      yield* Deferred.succeed(release, null);
      yield* Deferred.await(started.outcome);
      yield* Effect.yieldNow;
      assert.strictEqual(notified.length, 1);
    }).pipe(Effect.scoped),
  );
});

describe('a Spawned subagent session pending interaction', () => {
  const pending = Effect.fnUntraced(function* () {
    const release = Deferred.makeUnsafe<null>();
    const answers: unknown[] = [];
    const h = yield* setup({
      duringPrompt: Effect.suspend(() => {
        h.childFold.onPermissionRequest(CHILD, {} as PendingPermission['request'], response => {
          answers.push(response);
        });
        return Deferred.await(release);
      }),
    });
    const { cancelSubagentAtomFn, respondPermissionAtomFn } = createChatAtoms(createHostRuntime(mockHostLayer));
    h.registry.mount(cancelSubagentAtomFn);
    h.registry.mount(respondPermissionAtomFn);
    const started = yield* h.start();
    yield* until(() => h.mirror()?.pendingPermission !== undefined);
    return { ...h, answers, cancelSubagentAtomFn, release, respondPermissionAtomFn, started };
  });

  it.effect('is on the child root and the mirror, and answering on the child target clears both', () =>
    Effect.gen(function* () {
      const h = yield* pending();
      assert.isDefined(h.root()?.pendingPermission);
      assert.strictEqual(h.mirror()?.pendingPermission, h.root()?.pendingPermission);

      yield* runAtomFn(h.registry, h.respondPermissionAtomFn, {
        launchTarget: CLAUDE,
        optionId: 'allow',
        sessionId: CHILD,
      });
      yield* until(() => h.mirror()?.pendingPermission === undefined);

      assert.isUndefined(h.root()?.pendingPermission);
      assert.deepStrictEqual(h.answers, [{ outcome: { optionId: 'allow', outcome: 'selected' } }]);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('Prompt turn cancel through the parent resolves it as cancelled and cancels the child turn', () =>
    Effect.gen(function* () {
      const h = yield* pending();

      yield* runAtomFn(h.registry, h.cancelSubagentAtomFn, { launchTarget: CODEX, sessionId: CHILD });
      yield* until(() => h.mirror()?.pendingPermission === undefined);

      assert.deepStrictEqual(h.answers, [{ outcome: { outcome: 'cancelled' } }]);
      assert.include(h.childCalls, `cancel:${CHILD}`);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('Connection lost on the child target clears it and fails the child', () =>
    Effect.gen(function* () {
      const h = yield* pending();

      h.childFold.onConnectionLost();
      yield* until(() => h.mirror()?.pendingPermission === undefined);

      assert.deepStrictEqual(h.answers, [{ outcome: { outcome: 'cancelled' } }]);
      assert.strictEqual(h.mirror()?.state?.state, 'failed');
      assert.strictEqual((yield* Deferred.await(h.started.outcome)).status, 'failed');
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('holds no Keep awake while open: the child root and its parent root are both blocked', () =>
    Effect.gen(function* () {
      const h = yield* pending();
      // The parent's own turn is in flight too.
      updateHarnessSnapshot(h.registry, CODEX, current => ({
        ...current,
        sessions: { ...current.sessions, [PARENT]: { ...current.sessions[PARENT], pendingClientRequest: 'prompt' } },
      }));
      const snapshots = () => [
        h.registry.get(backendHarnessSnapshotAtom(CODEX)),
        h.registry.get(backendHarnessSnapshotAtom(CLAUDE)),
      ];
      assert.isFalse(anyPromptTurnWorking(snapshots()));

      yield* runAtomFn(h.registry, h.respondPermissionAtomFn, {
        launchTarget: CLAUDE,
        optionId: 'allow',
        sessionId: CHILD,
      });
      yield* until(() => h.mirror()?.pendingPermission === undefined);
      assert.isTrue(anyPromptTurnWorking(snapshots()));
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );
});

describe('Session History of a Spawned subagent session', () => {
  it.effect('is hidden while linked, even after a session/list refresh, and appears titled once the link ends', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const started = yield* h.start();
      yield* Deferred.await(started.outcome);
      const childRows = () => h.registry.get(unifiedSessionHistoryAtom).filter(entry => entry.sessionId === CHILD);

      assert.deepStrictEqual(childRows(), []);
      // A `session/list` refresh returns the child's row on its target.
      updateHarnessSnapshot(h.registry, CLAUDE, current => ({
        ...current,
        sessionHistory: [...current.sessionHistory, { cwd: '/w', sessionId: CHILD, title: 'From list' }],
      }));
      assert.deepStrictEqual(childRows(), []);

      // Without a refresh, a closed child must still appear with a title.
      updateHarnessSnapshot(h.registry, CLAUDE, current => ({ ...current, sessionHistory: [] }));
      yield* endLink(h.registry, { launchTarget: CLAUDE, sessionId: CHILD });
      assert.deepStrictEqual(
        childRows().map(entry => [entry.launchTarget, entry.title]),
        [[CLAUDE, 'Review the diff']],
      );
    }).pipe(Effect.scoped),
  );
});

describe('startSpawnedSubagent refusals', () => {
  const left = (h: Effect.Success<ReturnType<typeof setup>>) => ({
    link: allLinks(h.registry).length,
    mirror: h.mirror(),
    root: h.root(),
    history: registryHistory(h.registry),
  });

  it.effect('refuses the parent own launch target', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const error = yield* Effect.flip(
        startSpawnedSubagent(h.registry, {
          configOptions: {},
          description: 'x',
          launchTarget: CODEX,
          parent: { launchTarget: CODEX, sessionId: PARENT },
          task: 'task',
        }).pipe(Effect.provide(hostLayer)),
      );
      assert.instanceOf(error, SpawnSubagentError);
      assert.include(error.message, 'different launch target');
      assert.deepStrictEqual(h.childCalls, []);
    }).pipe(Effect.scoped),
  );

  it.effect('refuses an invalid config option before creating any session', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const error = yield* Effect.flip(h.start({ configOptions: { model: 'nope' } }));
      assert.include(error.message, 'Valid models: gpt, o1');
      assert.deepStrictEqual(h.childCalls, []);
    }).pipe(Effect.scoped),
  );

  it.effect('leaves nothing behind when the parent closed during create', () =>
    Effect.gen(function* () {
      const h = yield* setup({
        duringNew: Effect.sync(() => {
          updateHarnessSnapshot(h.registry, CODEX, current => ({
            ...current,
            sessions: { [PARENT]: { ...current.sessions[PARENT], status: 'inactive' } },
          }));
        }),
      });
      const error = yield* Effect.flip(h.start());
      assert.include(error.message, 'closed');
      assert.include(h.childCalls, `close:${CHILD}`);
      assert.deepStrictEqual(left(h), { history: [], link: 0, mirror: undefined, root: undefined });
    }).pipe(Effect.scoped),
  );

  it.effect('leaves nothing behind, and frees its slot, when interrupted during setup', () =>
    Effect.gen(function* () {
      const h = yield* setup({ duringSetConfig: Effect.never });
      const fiber = yield* Effect.forkChild(h.start());
      yield* until(() => h.childCalls.includes(`set:model:o1`));
      assert.strictEqual(allLinks(h.registry).length, 1);
      yield* Fiber.interrupt(fiber);
      assert.include(h.childCalls, `close:${CHILD}`);
      assert.deepStrictEqual(left(h), { history: [], link: 0, mirror: undefined, root: undefined });
      assert.strictEqual(slotsInUse(h.registry, { launchTarget: CODEX, sessionId: PARENT }), 0);
    }).pipe(Effect.scoped),
  );

  it.effect('leaves nothing behind when the config options cannot be applied', () =>
    Effect.gen(function* () {
      const h = yield* setup({ failSetConfig: true });
      const error = yield* Effect.flip(h.start());
      assert.include(error.message, 'config options');
      assert.include(h.childCalls, `close:${CHILD}`);
      assert.notInclude(h.childCalls, `prompt:${CHILD}`);
      assert.deepStrictEqual(left(h), { history: [], link: 0, mirror: undefined, root: undefined });
    }).pipe(Effect.scoped),
  );
});

import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { NO_AGENT_CAPABILITIES } from '../host/agentCapabilities.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { connectFakeAgent } from './fakeAgent.testing.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

const setup = Effect.fnUntraced(function* (
  sessionRename: (payload: { sessionId: string; title: string }) => Effect.Effect<unknown, unknown>,
) {
  yield* connectFakeAgent('codex-acp', {
    agent: {},
    notify: () => Effect.void,
    sessionArchive: () => Effect.void,
    sessionFork: () => Effect.void,
    sessionRename,
  });
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const { renameSessionAtomFn } = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn, () => Effect.void);
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), r =>
    Effect.sync(() => {
      r.dispose();
    }),
  );
  registry.mount(renameSessionAtomFn);
  updateHarnessSnapshot(registry, 'codex-acp', () => ({
    ...initialBackendHarnessSnapshot(),
    agentCapabilities: { ...NO_AGENT_CAPABILITIES, sessionRename: true },
    phase: 'ready',
    sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'Old' }],
  }));
  const title = () => registry.get(backendHarnessSnapshotAtom('codex-acp')).sessionHistory[0].title;
  return { registry, renameSessionAtomFn, title };
});

describe('renameSessionAtomFn', () => {
  it.effect('success keeps the new title', () =>
    Effect.gen(function* () {
      const { registry, renameSessionAtomFn, title } = yield* setup(() => Effect.void);
      yield* runAtomFn(registry, renameSessionAtomFn, { launchTarget: 'codex-acp', sessionId: 's1', title: 'New' });
      assert.strictEqual(title(), 'New');
    }),
  );

  it.effect('failure restores the previous title', () =>
    Effect.gen(function* () {
      const { registry, renameSessionAtomFn, title } = yield* setup(() => Effect.fail('boom'));
      yield* Effect.exit(
        runAtomFn(registry, renameSessionAtomFn, { launchTarget: 'codex-acp', sessionId: 's1', title: 'New' }),
      );
      assert.strictEqual(title(), 'Old');
    }),
  );

  it.effect('failure does not clobber a newer title', () =>
    Effect.gen(function* () {
      let patch: () => void = () => undefined;
      const { registry, renameSessionAtomFn, title } = yield* setup(() =>
        Effect.suspend(() => {
          patch();
          return Effect.fail('boom');
        }),
      );
      patch = () => {
        updateHarnessSnapshot(registry, 'codex-acp', current => ({
          ...current,
          sessionHistory: [{ ...current.sessionHistory[0], title: 'Agent sanitized' }],
        }));
      };
      yield* Effect.exit(
        runAtomFn(registry, renameSessionAtomFn, { launchTarget: 'codex-acp', sessionId: 's1', title: 'New' }),
      );
      assert.strictEqual(title(), 'Agent sanitized');
    }),
  );
});

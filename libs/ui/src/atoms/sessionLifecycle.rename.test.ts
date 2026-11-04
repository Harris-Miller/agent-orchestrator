import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { clearConnectedAgent, setConnectedAgent } from '../host/sessionRpc.ts';

import { backendHarnessStateAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const setup = (sessionRename: (payload: { sessionId: string; title: string }) => Effect.Effect<unknown, unknown>) => {
  setConnectedAgent('codex-acp', {
    agent: {},
    notify: () => Effect.void,
    sessionArchive: () => Effect.void,
    sessionFork: () => Effect.void,
    sessionRename,
  } as unknown as Parameters<typeof setConnectedAgent>[1]);
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const { refreshSessionFsListingAtomFn } = createSessionFsListingAtoms(runtime, Atom.make<readonly string[]>([]));
  const { renameSessionAtomFn } = createSessionLifecycleAtoms(
    runtime,
    refreshSessionFsListingAtomFn,
    cancelPromptAtomFn,
  );
  const registry = AtomRegistry.make();
  registry.mount(renameSessionAtomFn);
  registry.set(backendHarnessStateAtom('codex-acp'), {
    ...initialBackendHarnessSnapshot(),
    phase: 'ready',
    sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'Old' }],
  });
  const title = () => registry.get(backendHarnessStateAtom('codex-acp')).sessionHistory[0].title;
  return { registry, renameSessionAtomFn, title };
};

describe('renameSessionAtomFn', () => {
  it.live('success keeps the new title', () =>
    Effect.gen(function* () {
      const { registry, renameSessionAtomFn, title } = setup(() => Effect.void);
      yield* runAtomFn(registry, renameSessionAtomFn, { launchTarget: 'codex-acp', sessionId: 's1', title: 'New' });
      assert.strictEqual(title(), 'New');
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.live('failure restores the previous title', () =>
    Effect.gen(function* () {
      const { registry, renameSessionAtomFn, title } = setup(() => Effect.fail('boom'));
      yield* Effect.exit(
        runAtomFn(registry, renameSessionAtomFn, { launchTarget: 'codex-acp', sessionId: 's1', title: 'New' }),
      );
      assert.strictEqual(title(), 'Old');
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );

  it.live('failure does not clobber a newer title', () =>
    Effect.gen(function* () {
      let patch: () => void = () => undefined;
      const { registry, renameSessionAtomFn, title } = setup(() =>
        Effect.suspend(() => {
          patch();
          return Effect.fail('boom');
        }),
      );
      patch = () => {
        const current = registry.get(backendHarnessStateAtom('codex-acp'));
        registry.set(backendHarnessStateAtom('codex-acp'), {
          ...current,
          sessionHistory: [{ ...current.sessionHistory[0], title: 'Agent sanitized' }],
        });
      };
      yield* Effect.exit(
        runAtomFn(registry, renameSessionAtomFn, { launchTarget: 'codex-acp', sessionId: 's1', title: 'New' }),
      );
      assert.strictEqual(title(), 'Agent sanitized');
      clearConnectedAgent('codex-acp');
      registry.dispose();
    }),
  );
});

import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot, normalizeConfigOptions } from '../host/acpSessionBootstrap.ts';
import { NO_AGENT_CAPABILITIES } from '../host/agentCapabilities.ts';
import { emptySessionTranscript } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { connectFakeAgent } from './fakeAgent.testing.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { createVirtualSessionAtoms, lastCreateDefaultsAtom, virtualSessionAtom } from './virtualSession.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

const config = {
  configOptions: [
    {
      currentValue: 'gpt',
      id: 'model',
      name: 'Model',
      options: [{ name: 'gpt', value: 'gpt' }],
      type: 'select' as const,
    },
  ],
};

/** `session/new` and the archive/delete RPC are slow so the header's `switchToVirtualSession` Bind lands mid-RPC. */
const installSlowAgent = () =>
  connectFakeAgent('codex-acp', {
    agent: {
      'session/close': () => Effect.sleep('50 millis'),
      'session/delete': () => Effect.sleep('50 millis'),
      'session/new': () => Effect.as(Effect.sleep('10 millis'), { ...config, sessionId: 'bound-1' }),
    },
    notify: () => Effect.void,
    sessionArchive: () => Effect.sleep('50 millis'),
    sessionFork: () => Effect.fail('no-fork'),
  });

const setup = () => {
  const runtime = createHostRuntime(mockHostLayer);
  const lifecycle = createSessionLifecycleAtoms(runtime, () => Effect.void);
  const { ensureVirtualSessionAtomFn } = createVirtualSessionAtoms(runtime);
  const registry = AtomRegistry.make();
  registry.mount(lifecycle.archiveSessionAtomFn);
  registry.mount(lifecycle.deleteSessionAtomFn);
  registry.mount(ensureVirtualSessionAtomFn);

  updateHarnessSnapshot(registry, 'codex-acp', () => ({
    ...initialBackendHarnessSnapshot(),
    agentCapabilities: { ...NO_AGENT_CAPABILITIES, sessionArchive: true, sessionClose: true },
    phase: 'ready',
    sessions: {
      'old-1': {
        cwd: '/proj',
        configuration: normalizeConfigOptions(config),
        sessionId: 'old-1',
        status: 'active',
        transcript: emptySessionTranscript(),
      },
    },
  }));
  registry.set(selectedAtom, { _tag: 'Session', sessionId: 'old-1' });
  registry.set(lastCreateDefaultsAtom, { configValues: {}, launchTarget: 'codex-acp' });
  return { ensureVirtualSessionAtomFn, lifecycle, registry };
};

describe('Header Archive/Delete races the Bind kicked by switchToVirtualSession', () => {
  for (const action of ['archiveSessionAtomFn', 'deactivateSessionAtomFn', 'deleteSessionAtomFn'] as const) {
    it.live(`${action}: Bound Virtual session survives the stale snapshot write`, () =>
      Effect.gen(function* () {
        yield* installSlowAgent();
        const { ensureVirtualSessionAtomFn, lifecycle, registry } = setup();

        // Same order as SessionChatPage: switchToVirtualSession (not awaited), then the action.
        registry.set(ensureVirtualSessionAtomFn, { cwd: '/proj' });
        yield* runAtomFn(registry, lifecycle[action], { launchTarget: 'codex-acp', sessionId: 'old-1' });
        yield* Effect.sleep('100 millis');

        const boundId = registry.get(virtualSessionAtom)?.sessionId;
        const { sessions } = registry.get(backendHarnessSnapshotAtom('codex-acp'));
        assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
        assert.strictEqual(boundId, 'bound-1');
        assert.ok(
          boundId !== undefined && boundId in sessions,
          'Bound id is on the Virtual blob but missing from sessions',
        );
        registry.dispose();
      }),
    );
  }
});

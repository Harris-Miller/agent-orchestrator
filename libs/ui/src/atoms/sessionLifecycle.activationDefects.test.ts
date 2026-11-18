/** A failed activation records the defects of the latest inbound failure in the RPC wire log. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { advertise, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { appendRpcWireEntry } from './rpcWireLog.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const wireFailure = (defect: unknown) => ({
  direction: 'in' as const,
  id: 'seeded',
  message: { _tag: 'Exit', exit: { _tag: 'Failure', cause: [{ _tag: 'Die', defect }] } },
  receivedAt: 1,
});

const failActivation = Effect.fnUntraced(function* (seed: unknown) {
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const atoms = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn);
  const registry = yield* freshRegistry;
  yield* installFakeAgent([], { failLoad: true });
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/proj', sessionId: 's1' }],
    sessions: { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: '/proj' } },
  }));
  advertise(registry, CODEX, {});
  if (seed !== undefined) {
    appendRpcWireEntry(registry, CODEX, wireFailure(seed));
  }
  yield* runAtomFn(registry, atoms.activateSessionAtomFn, { launchTarget: CODEX, sessionId: 's1' });
  return registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1;
});

describe('activation failure defects', () => {
  it.effect('come from the latest inbound failure in the RPC wire log that carries defects', () =>
    Effect.gen(function* () {
      const session = yield* failActivation({ data: 'wire-detail' });
      assert.strictEqual(session.status, 'inactive');
      assert.deepStrictEqual(session.defects, [{ data: 'wire-detail' }]);
    }).pipe(Effect.scoped),
  );

  it.effect('fall back to the cause when the wire log carries none', () =>
    Effect.gen(function* () {
      const session = yield* failActivation(undefined);
      assert.strictEqual(session.status, 'inactive');
      assert.deepStrictEqual(session.defects, []);
    }).pipe(Effect.scoped),
  );
});

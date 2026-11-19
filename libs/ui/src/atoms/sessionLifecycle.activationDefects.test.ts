/** A failed activation records the defects of the latest inbound failure in the RPC wire log. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { makeHarnessEventFold } from './harnessEventFold.ts';
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

describe('AIR loadReplayEnd on a failing session/load', () => {
  const run = (withMarker: boolean) =>
    Effect.gen(function* () {
      const runtime = createHostRuntime(mockHostLayer);
      const { cancelPromptAtomFn } = createChatAtoms(runtime);
      const atoms = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn);
      const registry = yield* freshRegistry;
      const fold = makeHarnessEventFold({
        setModelPickerPrefs: () => undefined,
        launchTarget: CODEX,
        registry,
        runFork: () => undefined,
      });
      yield* installFakeAgent(
        [],
        {
          duringLoad: Effect.sync(() => {
            fold.onSessionUpdate('s1', {
              content: { text: 'replayed', type: 'text' },
              sessionUpdate: 'agent_message_chunk',
            });
            if (withMarker) {
              fold.onSessionUpdate('s1', {
                _meta: { jetbrains: { air: { loadReplayEnd: true, version: 1 } } },
                sessionUpdate: 'session_info_update',
              });
            }
          }),
          failLoad: true,
        },
        CODEX,
      );
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ cwd: '/proj', sessionId: 's1' }],
        sessions: { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: '/proj' } },
      }));
      advertise(registry, CODEX, {});
      yield* runAtomFn(registry, atoms.activateSessionAtomFn, { launchTarget: CODEX, sessionId: 's1' });
      return registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1;
    }).pipe(Effect.scoped);

  it.effect('keeps the replayed transcript when the marker arrived before the failure', () =>
    Effect.gen(function* () {
      const session = yield* run(true);
      assert.strictEqual(session.status, 'inactive');
      assert.strictEqual(session.transcript.items.length, 1);
    }),
  );

  it.effect('restores the previous transcript when the failure came before the marker', () =>
    Effect.gen(function* () {
      const session = yield* run(false);
      assert.strictEqual(session.status, 'inactive');
      assert.strictEqual(session.transcript.items.length, 0);
    }),
  );
});

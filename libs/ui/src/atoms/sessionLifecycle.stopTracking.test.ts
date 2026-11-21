/** Stop tracking a Project Deactivates every one of its Active sessions, then drops the Project. */
import { assert, describe, it } from '@effect/vitest';
import { addProject } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Fiber, Layer } from 'effect';
import { TestClock } from 'effect/testing';

import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { advertise, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { projectsAtom, projectsLoadedAtom } from './projects.atoms.ts';
import { stopTrackingProject } from './sessionLifecycle.ts';

const setup = Effect.fnUntraced(function* () {
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  yield* installFakeAgent(calls, { duringClose: Effect.sleep('5 millis') });
  advertise(registry, CODEX, { agentCapabilities: { sessionCapabilities: { close: {} } } });
  yield* addProject('/proj').pipe(Effect.provide(layer));
  yield* addProject('/keep').pipe(Effect.provide(layer));
  registry.set(projectsAtom, ['/proj', '/keep']);
  registry.set(projectsLoadedAtom, true);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [
      { cwd: '/proj', sessionId: 'a' },
      { cwd: '/proj', sessionId: 'b' },
      { cwd: '/keep', sessionId: 'kept' },
    ],
    sessions: {
      a: { ...initialSessionSnapshot('a', 'active'), cwd: '/proj' },
      b: { ...initialSessionSnapshot('b', 'active'), cwd: '/proj' },
      kept: { ...initialSessionSnapshot('kept', 'active'), cwd: '/keep' },
    },
  }));
  const status = (sessionId: string) => registry.get(backendHarnessSnapshotAtom(CODEX)).sessions[sessionId]?.status;
  const stop = stopTrackingProject(registry, '/proj').pipe(Effect.provide(layer));
  return { calls, registry, status, stop };
});

describe('Stop tracking a Project', () => {
  it.effect('Deactivates every Active session of the Project, not only the last one', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const stopping = yield* Effect.forkChild(s.stop);
      yield* TestClock.adjust('1 second');
      yield* Fiber.join(stopping);
      assert.sameMembers(s.calls, ['close:a', 'close:b']);
      assert.strictEqual(s.status('a'), 'inactive');
      assert.strictEqual(s.status('b'), 'inactive');
      assert.strictEqual(s.status('kept'), 'active');
      assert.deepStrictEqual(s.registry.get(projectsAtom), ['/keep']);
    }).pipe(Effect.scoped),
  );
});

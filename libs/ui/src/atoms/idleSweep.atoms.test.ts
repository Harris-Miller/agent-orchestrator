/** The idle session sweep against a fake Agent, with TestClock driving idle age and the tick schedule. */
import { assert, describe, it } from '@effect/vitest';
import { Duration, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { SessionSnapshot } from '../host/acpSessionBootstrap.ts';
import type { SessionRef } from '../host/agentLaunchTarget.ts';
import { IDLE_SWEEP_INTERVAL_MS, IDLE_THRESHOLD_MS } from '../host/idleSessions.ts';
import { appendUserChatMessage } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { advertise, CLAUDE, CODEX, enableProviders, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { handoffInProgressAtom } from './handoff.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { runIdleSweep, sweepIdleSessions } from './idleSweep.atoms.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const EPOCH = '1970-01-01T00:00:00.000Z';

const activeSession = (sessionId: string): SessionSnapshot => {
  const base = initialSessionSnapshot(sessionId, 'active');
  return { ...base, cwd: '/proj', transcript: appendUserChatMessage(base.transcript, 'hello') };
};

const setup = Effect.fnUntraced(function* (
  options: { readonly failClose?: boolean; readonly sessionClose?: boolean } = {},
) {
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  enableProviders(registry, [CODEX]);
  yield* installFakeAgent(calls, options, CODEX);
  const runtime = createHostRuntime(mockHostLayer);
  const atoms = createSessionLifecycleAtoms(runtime, () => Effect.void);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [
      { cwd: '/proj', sessionId: 's1', updatedAt: EPOCH },
      { cwd: '/proj', sessionId: 's2', updatedAt: EPOCH },
    ],
    sessions: { s1: activeSession('s1'), s2: activeSession('s2') },
  }));
  advertise(registry, CODEX, {
    agentCapabilities: {
      sessionCapabilities: { ...(options.sessionClose === false ? {} : { close: {} }), resume: {} },
    },
  });
  const snapshot = () => registry.get(backendHarnessSnapshotAtom(CODEX));
  const close = (target: SessionRef) => runAtomFn(registry, atoms.deactivateSessionAtomFn, target);
  return { atoms, calls, close, registry, snapshot };
});

const pastThreshold = TestClock.adjust(Duration.millis(IDLE_THRESHOLD_MS + 1));

describe('idle session sweep', () => {
  it.effect('closes the idle unselected session only, and selecting it resumes it', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
      yield* pastThreshold;
      yield* sweepIdleSessions(s.registry, s.close);
      assert.deepStrictEqual(s.calls, ['close:s2']);
      assert.strictEqual(s.snapshot().sessions.s1.status, 'active');
      assert.strictEqual(s.snapshot().sessions.s2.status, 'inactive');
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, { launchTarget: CODEX, sessionId: 's2' });
      assert.include(s.calls, 'resume:s2');
    }).pipe(Effect.scoped),
  );

  it.effect('closes nothing before the idle threshold', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* TestClock.adjust(Duration.millis(IDLE_THRESHOLD_MS));
      yield* sweepIdleSessions(s.registry, s.close);
      assert.deepStrictEqual(s.calls, []);
    }).pipe(Effect.scoped),
  );

  it.effect('a failed close does not stop the next one', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const closed: string[] = [];
      yield* pastThreshold;
      yield* sweepIdleSessions(s.registry, target =>
        target.sessionId === 's1' ? Effect.fail('boom') : Effect.sync(() => closed.push(target.sessionId)),
      );
      assert.deepStrictEqual(closed, ['s2']);
    }).pipe(Effect.scoped),
  );

  it.effect('skips a session selected between the filter and its close', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const closed: string[] = [];
      yield* pastThreshold;
      yield* sweepIdleSessions(s.registry, target =>
        Effect.sync(() => {
          closed.push(target.sessionId);
          s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 's2' });
        }),
      );
      assert.deepStrictEqual(closed, ['s1']);
    }).pipe(Effect.scoped),
  );

  it.effect('a failed close is retried on the next tick', () =>
    Effect.gen(function* () {
      const s = yield* setup({ failClose: true });
      yield* pastThreshold;
      const fiber = yield* Effect.forkChild(runIdleSweep(s.registry, s.close));
      yield* Effect.yieldNow;
      assert.deepStrictEqual(s.calls, ['close:s1', 'close:s2']);
      yield* TestClock.adjust(Duration.millis(IDLE_SWEEP_INTERVAL_MS));
      assert.deepStrictEqual(s.calls, ['close:s1', 'close:s2', 'close:s1', 'close:s2']);
      yield* Fiber.interrupt(fiber);
    }).pipe(Effect.scoped),
  );

  it.effect('closes nothing during a handoff, then closes on a later tick', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* pastThreshold;
      s.registry.set(handoffInProgressAtom, true);
      yield* sweepIdleSessions(s.registry, s.close);
      assert.deepStrictEqual(s.calls, []);
      s.registry.set(handoffInProgressAtom, false);
      yield* sweepIdleSessions(s.registry, s.close);
      assert.deepStrictEqual(s.calls, ['close:s1', 'close:s2']);
    }).pipe(Effect.scoped),
  );

  it.effect('closes nothing on a launch target that does not advertise Session close', () =>
    Effect.gen(function* () {
      const s = yield* setup({ sessionClose: false });
      yield* pastThreshold;
      yield* sweepIdleSessions(s.registry, s.close);
      assert.deepStrictEqual(s.calls, []);
    }).pipe(Effect.scoped),
  );

  it.effect('closes an idle session on each mounted launch target', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      for (const launchTarget of [CODEX, CLAUDE]) {
        updateHarnessSnapshot(registry, launchTarget, current => ({
          ...current,
          sessionHistory: [{ cwd: '/proj', sessionId: `${launchTarget}-s`, updatedAt: EPOCH }],
          sessions: { [`${launchTarget}-s`]: activeSession(`${launchTarget}-s`) },
        }));
        advertise(registry, launchTarget, { agentCapabilities: { sessionCapabilities: { close: {} } } });
      }
      const closed: string[] = [];
      yield* pastThreshold;
      yield* sweepIdleSessions(registry, ({ launchTarget, sessionId }) =>
        Effect.sync(() => closed.push(`${launchTarget}:${sessionId}`)),
      );
      assert.sameMembers(closed, [`${CODEX}:${CODEX}-s`, `${CLAUDE}:${CLAUDE}-s`]);
    }).pipe(Effect.scoped),
  );
});

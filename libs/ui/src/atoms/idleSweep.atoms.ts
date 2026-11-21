/**
 * Idle session sweep (glossary): one app-wide periodic pass that closes idle Sessions. Lives in `@lib/ui` so desktop and
 * VS Code behave identically. Closing is the Deactivate verb; re-selecting a closed Session re-activates it.
 */
import { Cause, Clock, Duration, Effect, Schedule } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { SessionRef } from '../host/agentLaunchTarget.ts';
import { canCloseNow, IDLE_SWEEP_INTERVAL_MS, IDLE_THRESHOLD_MS, selectIdleSessions } from '../host/idleSessions.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { handoffInProgressAtom } from './handoff.atoms.ts';
import { deactivateSession } from './sessionLifecycle.ts';

type Registry = AtomRegistry.AtomRegistry;

const selectedSessionId = (registry: Registry): string | undefined => {
  const selected = registry.get(selectedAtom);
  return selected?._tag === 'Session' ? selected.sessionId : undefined;
};

type CloseSession = (target: SessionRef) => Effect.Effect<unknown, unknown>;

/** Selection and live work are re-read right before the close: the user may have just selected the chat. */
const canCloseTargetNow = (registry: Registry, { launchTarget, sessionId }: SessionRef): boolean =>
  canCloseNow({
    handoffInProgress: registry.get(handoffInProgressAtom),
    selectedSessionId: selectedSessionId(registry),
    sessionId,
    snapshot: registry.get(backendHarnessSnapshotAtom(launchTarget)),
  });

/** One tick: close every idle Session, one at a time. A failed close is logged and retried on the next tick. */
export const sweepIdleSessions = Effect.fn('sweepIdleSessions')(function* (registry: Registry, close: CloseSession) {
  const now = yield* Clock.currentTimeMillis;
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    const idle = selectIdleSessions({
      handoffInProgress: registry.get(handoffInProgressAtom),
      now,
      selectedSessionId: selectedSessionId(registry),
      snapshot: registry.get(backendHarnessSnapshotAtom(launchTarget)),
      thresholdMs: IDLE_THRESHOLD_MS,
    });
    for (const sessionId of idle) {
      const target = { launchTarget, sessionId };
      if (canCloseTargetNow(registry, target)) {
        yield* Effect.logInfo('Idle session sweep closing', launchTarget, sessionId);
        yield* close(target).pipe(
          Effect.catchCause(cause =>
            Effect.logError('Idle session sweep close failed', launchTarget, sessionId, Cause.pretty(cause)),
          ),
        );
      }
    }
  }
});

export const runIdleSweep = (registry: Registry, close: CloseSession) =>
  Effect.repeat(sweepIdleSessions(registry, close), Schedule.spaced(Duration.millis(IDLE_SWEEP_INTERVAL_MS)));

export const createIdleSweepAtoms = (runtime: HostRuntimeBag['atomRuntime']) => ({
  /** Mount for the app's lifetime (`IdleSweepMount`). */
  idleSweepAtom: runtime.atom(get => runIdleSweep(get.registry, target => deactivateSession(get.registry, target))),
});

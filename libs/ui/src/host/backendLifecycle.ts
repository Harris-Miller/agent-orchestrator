/**
 * Single owner of provider process lifetime. One fiber per launch target runs the backend harness;
 * `stop` interrupts it and waits for its finalizers (process kill + exit). Atoms never own process lifetime,
 * so unmount / remount cannot start duplicates, and a stopped target is only started again by an explicit `start`.
 */
import { Effect, Fiber } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

export type BackendLifecycle<R = never> = {
  /** Fork `run` unless this target already has a live harness fiber. Returns whether it started. */
  readonly start: (launchTarget: AgentLaunchTarget, run: Effect.Effect<void, never, R>) => boolean;
  /** Interrupt the harness fiber and await finalizers (process tree killed, exit awaited). No-op when none. */
  readonly stop: (launchTarget: AgentLaunchTarget) => Effect.Effect<void>;
  readonly isRunning: (launchTarget: AgentLaunchTarget) => boolean;
};

/** `fork` supplies the Host services (e.g. `hostRunFork`). */
export const makeBackendLifecycle = <R = never>(
  fork: (effect: Effect.Effect<void, never, R>) => Fiber.Fiber<void>,
): BackendLifecycle<R> => {
  const fibers = new Map<AgentLaunchTarget, Fiber.Fiber<void>>();

  return {
    isRunning: launchTarget => fibers.has(launchTarget),
    start: (launchTarget, run) => {
      if (fibers.has(launchTarget)) {
        return false;
      }
      const holder: { done: boolean; fiber?: Fiber.Fiber<void> } = { done: false };
      const fiber = fork(
        run.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              // Harness gave up (retries exhausted / terminal prerequisite): free the slot for an explicit restart.
              holder.done = true;
              if (holder.fiber !== undefined && fibers.get(launchTarget) === holder.fiber) {
                fibers.delete(launchTarget);
              }
            }),
          ),
        ),
      );
      holder.fiber = fiber;
      // The fiber may already have finished while forking (synchronous give-up): don't hold the slot.
      if (!holder.done) {
        fibers.set(launchTarget, fiber);
      }
      return true;
    },
    stop: Effect.fn('BackendLifecycle.stop')(function* (launchTarget: AgentLaunchTarget) {
      const fiber = fibers.get(launchTarget);
      fibers.delete(launchTarget);
      if (fiber !== undefined) {
        yield* Fiber.interrupt(fiber);
      }
    }),
  };
};

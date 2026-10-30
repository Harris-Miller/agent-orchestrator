/**
 * Shell helpers for Antigravity install (unzip outside AO home) + FS error mapping.
 */
import { ANTIGRAVITY_ACP_SPAWN_NAME } from '@lib/ao-home';
import { Effect } from 'effect';
import type * as PlatformError from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';

export const asAntigravityMissingPrerequisite = (message: string) =>
  new MissingLaunchPrerequisite({
    executable: ANTIGRAVITY_ACP_SPAWN_NAME,
    message,
  });

/** Map PlatformError → MissingLaunchPrerequisite with a detail prefix. */
export const mapAntigravityFs = <A, R>(
  effect: Effect.Effect<A, PlatformError.PlatformError, R>,
  detail: string,
): Effect.Effect<A, MissingLaunchPrerequisite, R> =>
  effect.pipe(Effect.mapError(error => asAntigravityMissingPrerequisite(`${detail}: ${error.message}`)));

/** Run a short shell command; non-zero exit → MissingLaunchPrerequisite. */
export const runAntigravityShell = Effect.fn('runAntigravityShell')(function* (
  name: string,
  args: readonly string[],
  failMessage: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner
    .exitCode(ChildProcess.make(name, [...args], { extendEnv: true }))
    .pipe(
      Effect.mapError(error =>
        asAntigravityMissingPrerequisite(
          `${failMessage} (spawn: ${error instanceof Error ? error.message : String(error)})`,
        ),
      ),
    );
  if (exitCode !== 0) {
    return yield* asAntigravityMissingPrerequisite(`${failMessage} (exit ${String(exitCode)})`);
  }
});

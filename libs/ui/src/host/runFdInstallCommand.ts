/** Spawn a package-manager install for `fd` (argv only; no shell). */
import { Effect, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import type { FdInstallCommand } from './fdInstallCommands.ts';

export class FdInstallError extends Schema.TaggedError<FdInstallError>()('FdInstallError', {
  message: Schema.String,
}) {}

/** Run one install command; succeeds on exit 0, fails with {@link FdInstallError} otherwise. */
export const runFdInstallCommand = Effect.fn('runFdInstallCommand')(function* (install: FdInstallCommand) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make(install.command, [...install.args], { extendEnv: true });
  const exitCode = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      return yield* handle.exitCode;
    }),
  );
  if (exitCode !== 0) {
    return yield* new FdInstallError({
      message: `Could not install. Close the application and install manually, then try again.`,
    });
  }
});

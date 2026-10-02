/** Probe PATH for `fd` then `fdfind`; remember the resolved command name for listing spawns. */
import { Effect, Option } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export type FdBinaryName = 'fd' | 'fdfind';

const FD_CANDIDATES = ['fd', 'fdfind'] as const satisfies readonly FdBinaryName[];

/** Module slot: last successful probe result (command name for ChildProcess.make). */
let resolvedFdBinary: Option.Option<FdBinaryName> = Option.none();

export const getResolvedFdBinary = (): Effect.Effect<Option.Option<FdBinaryName>> => Effect.succeed(resolvedFdBinary);

export const clearResolvedFdBinary = (): Effect.Effect<void> =>
  Effect.sync(() => {
    resolvedFdBinary = Option.none();
  });

/**
 * Probe by spawning `fd`/`fdfind --version` (shell-scoped names).
 * Avoids Tauri `fs.exists` PATH walks — Homebrew symlinks are forbidden by fs scope.
 */
export const resolveFdBinary = Effect.fn('resolveFdBinary')(
  function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    for (const name of FD_CANDIDATES) {
      const exitCode = yield* spawner
        .exitCode(ChildProcess.make(name, ['--version'], { extendEnv: true }))
        .pipe(Effect.orElseSucceed(() => ChildProcessSpawner.ExitCode(1)));
      if (exitCode === 0) {
        resolvedFdBinary = Option.some(name);
        yield* Effect.logDebug('Resolved fd binary', name);
        return Option.some(name);
      }
    }
    resolvedFdBinary = Option.none();
    yield* Effect.logDebug('fd/fdfind not found on PATH');
    return Option.none<FdBinaryName>();
  },
  Effect.annotateLogs({ module: 'resolveFdBinary' }),
);

/** Resolved command name, or re-probe if the slot is empty. */
export const requireFdBinary = Effect.fn('requireFdBinary')(function* () {
  if (Option.isSome(resolvedFdBinary)) {
    return resolvedFdBinary.value;
  }
  const resolved = yield* resolveFdBinary();
  if (Option.isNone(resolved)) {
    return yield* Effect.die(new Error('fd/fdfind required but not found on PATH'));
  }
  return resolved.value;
});

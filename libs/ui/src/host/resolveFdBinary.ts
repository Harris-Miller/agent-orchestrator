/** Probe PATH for `fd` then `fdfind`; remember the resolved command name for listing spawns. */
import { Effect, Option } from 'effect';

import { findExecutableOnPath } from './findExecutableOnPath.ts';

export type FdBinaryName = 'fd' | 'fdfind';

const FD_CANDIDATES = ['fd', 'fdfind'] as const satisfies readonly FdBinaryName[];

/** Module slot: last successful probe result (command name for ChildProcess.make). */
let resolvedFdBinary: Option.Option<FdBinaryName> = Option.none();

export const getResolvedFdBinary = (): Effect.Effect<Option.Option<FdBinaryName>> => Effect.succeed(resolvedFdBinary);

export const clearResolvedFdBinary = (): Effect.Effect<void> =>
  Effect.sync(() => {
    resolvedFdBinary = Option.none();
  });

/** Probe `fd` then `fdfind`; persist and return the command name when found. */
export const resolveFdBinary = Effect.fn('resolveFdBinary')(
  function* () {
    for (const name of FD_CANDIDATES) {
      const found = yield* findExecutableOnPath(name);
      if (Option.isSome(found)) {
        resolvedFdBinary = Option.some(name);
        yield* Effect.logDebug('Resolved fd binary', name, found.value);
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

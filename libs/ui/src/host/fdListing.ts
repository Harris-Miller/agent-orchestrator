/** Shared `fd` / `fdfind` directory + file listing helpers (NUL-delimited). */
import { Effect, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import type { FdBinaryName } from './resolveFdBinary.ts';
import { requireFdBinary } from './resolveFdBinary.ts';

export type FdListingEntry = {
  readonly kind: 'dir' | 'file';
  readonly path: string;
};

export class FdListingError extends Schema.TaggedError<FdListingError>()('FdListingError', {
  message: Schema.String,
}) {}

export type ShallowDirListingOptions = {
  readonly showHidden: boolean;
};

/** Argv for shallow depth-1 directory listing (`-H` only when showHidden). */
export const shallowDirListingArgs = (options: ShallowDirListingOptions): readonly string[] => {
  const args = ['-t', 'd', '-d', '1', '-0'];
  if (options.showHidden) {
    return ['-H', ...args];
  }
  return args;
};

/** Argv for recursive directory listing (always `-H`, never `-I`). */
export const recursiveDirListingArgs = (): readonly string[] => ['-t', 'd', '-H', '-0'];

/** Argv for recursive file listing (always `-H`, never `-I`). */
export const recursiveFileListingArgs = (): readonly string[] => ['-t', 'f', '-H', '-0'];

/** Parse NUL-delimited `fd` stdout into relative path strings. */
export const parseNulPaths = (stdout: string): readonly string[] =>
  stdout
    .split('\0')
    .map(raw => raw.trim())
    .filter(trimmed => trimmed.length > 0 && trimmed !== '.' && trimmed !== '..')
    .map(trimmed => {
      const withoutDotSlash = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
      return withoutDotSlash.replaceAll('\\', '/');
    })
    .filter(normalized => normalized.length > 0 && normalized !== '.' && normalized !== '..');

/** Basename (last path segment) for a relative or absolute listing path. */
export const listingBasename = (entryPath: string): string => {
  const normalized = entryPath.replaceAll('\\', '/');
  const withoutTrailing = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  const parts = withoutTrailing.split('/');
  return parts[parts.length - 1] ?? withoutTrailing;
};

const spawnFdStdout = Effect.fn('spawnFdStdout')(function* (
  binary: FdBinaryName,
  args: readonly string[],
  cwd: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make(binary, [...args], {
    cwd,
    extendEnv: true,
  });

  type Listed =
    | { readonly _tag: 'Failed'; readonly exitCode: ChildProcessSpawner.ExitCode }
    | { readonly _tag: 'Succeeded'; readonly stdout: string };

  const listed: Listed = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const [chunks, exitCode] = yield* Effect.all(
        [handle.stdout.pipe(Stream.decodeText(), Stream.runCollect), handle.exitCode],
        { concurrency: 2 },
      );
      if (exitCode !== 0) {
        return { _tag: 'Failed', exitCode } as const;
      }
      return { _tag: 'Succeeded', stdout: [...chunks].join('') } as const;
    }),
  );

  if (listed._tag === 'Failed') {
    return yield* new FdListingError({
      message: `${binary} exited with code ${String(listed.exitCode)} while listing ${cwd}`,
    });
  }
  return listed.stdout;
});

/**
 * Shallow child directory basenames under `cwd` via resolved `fd`/`fdfind`.
 * Hidden filtering is encoded in argv (`-H`), not applied client-side.
 */
export const listShallowDirectories = Effect.fn('listShallowDirectories')(function* (
  cwd: string,
  options: ShallowDirListingOptions,
) {
  const binary = yield* requireFdBinary();
  const stdout = yield* spawnFdStdout(binary, shallowDirListingArgs(options), cwd);
  const names = [...new Set(parseNulPaths(stdout).map(listingBasename))].sort((a, b) => a.localeCompare(b));
  return names;
});

/**
 * Full recursive file + directory listing under `cwd` (always `-H`).
 * Paths are relative to `cwd` as printed by `fd`.
 */
export const listRecursiveEntries = Effect.fn('listRecursiveEntries')(function* (cwd: string) {
  const binary = yield* requireFdBinary();
  const [dirStdout, fileStdout] = yield* Effect.all(
    [spawnFdStdout(binary, recursiveDirListingArgs(), cwd), spawnFdStdout(binary, recursiveFileListingArgs(), cwd)],
    { concurrency: 2 },
  );

  const dirs = parseNulPaths(dirStdout).map((path): FdListingEntry => ({
    kind: 'dir',
    path: path.endsWith('/') ? path : `${path}/`,
  }));
  const files = parseNulPaths(fileStdout).map((path): FdListingEntry => ({ kind: 'file', path }));

  const byPath = new Map<string, FdListingEntry>();
  for (const entry of [...dirs, ...files]) {
    byPath.set(entry.path, entry);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
});

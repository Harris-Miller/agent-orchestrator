/** Portable directory-browser helpers for create-session cwd picking. */
import { OS } from '@lib/context-services';
import { Effect, Ref, Schema, Stream } from 'effect';
import { Path } from 'effect/Path';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export const PARENT_DIR_ENTRY = '..' as const;

/** Wall-clock grace after exit so late stdout chunks land (Tauri queues). */
const POST_EXIT_STDOUT_DRAIN_MS = 100;

export type ListChildDirectoriesOptions = {
  readonly showHidden: boolean;
};

export type ChildDirectoryListCommand = {
  readonly args: readonly string[];
  readonly command: string;
};

export class ListChildDirectoriesError extends Schema.TaggedError<ListChildDirectoriesError>()(
  'ListChildDirectoriesError',
  {
    message: Schema.String,
  },
) {}

export const normalizeDirPath = (dirPath: string): string => {
  if (dirPath.length > 1 && (dirPath.endsWith('/') || dirPath.endsWith('\\'))) {
    return dirPath.slice(0, -1);
  }
  return dirPath;
};

/** `$HOME` from Effect `OS` (Tauri Live or other runtime). */
export const resolveHomeDir = Effect.fn('resolveHomeDir')(function* () {
  const os = yield* OS;
  return normalizeDirPath(os.homedir());
});

/** Build the depth-1 directory listing CLI for the host platform. */
export const childDirectoryListCommand = (
  platform: string,
  options: ListChildDirectoriesOptions,
): ChildDirectoryListCommand => {
  if (platform === 'win32') {
    return {
      args: ['/c', 'dir', '/b', options.showHidden ? '/a:d' : '/a:d-h'],
      command: 'cmd',
    };
  }
  if (platform === 'darwin' || platform === 'linux') {
    return {
      args: options.showHidden
        ? ['.', '-maxdepth', '1', '-mindepth', '1', '-type', 'd']
        : ['.', '-maxdepth', '1', '-mindepth', '1', '!', '-name', '.*', '-type', 'd'],
      command: 'find',
    };
  }
  throw new ListChildDirectoriesError({
    message: `Unsupported platform for directory listing: ${platform}`,
  });
};

/** Parse `find` / `dir` stdout into sorted bare directory names. */
export const parseChildDirectoryStdout = (stdout: string): readonly string[] => {
  const names = new Set<string>();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length > 0 && line !== '.' && line !== '..') {
      const withoutDotSlash = line.startsWith('./') ? line.slice(2) : line;
      const basename = withoutDotSlash.replaceAll('\\', '/').split('/').at(-1);
      if (basename !== undefined && basename.length > 0 && basename !== '.' && basename !== '..') {
        names.add(basename);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

const mergeChunks = (chunks: readonly Uint8Array[]): string => {
  const totalLength = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
};

/** Wall clock — `@effect/vitest` TestClock freezes `Effect.sleep`. */
const wallSleep = (ms: number): Effect.Effect<void> =>
  Effect.promise(
    () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, ms);
      }),
  );

/**
 * Child directory names under `dirPath` via platform CLI (`find` / `cmd dir`).
 * Hidden filtering is encoded in the command args, not applied client-side.
 */
export const listChildDirectories = Effect.fn('listChildDirectories')(function* (
  dirPath: string,
  options: ListChildDirectoriesOptions,
) {
  const os = yield* OS;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const platform = os.platform();
  if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
    return yield* new ListChildDirectoriesError({
      message: `Unsupported platform for directory listing: ${platform}`,
    });
  }
  const { args, command: commandName } = childDirectoryListCommand(platform, options);
  const command = ChildProcess.make(commandName, [...args], {
    cwd: dirPath,
    extendEnv: true,
  });

  // Tauri ChildProcessSpawnerLive never ends stdout Queue on process close, so
  // spawner.string() hangs. Fork a collector, await exit, then drain briefly.
  const { exitCode, stdout } = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const chunksRef = yield* Ref.make<readonly Uint8Array[]>([]);
      yield* Effect.forkScoped(
        handle.stdout.pipe(Stream.runForEach(chunk => Ref.update(chunksRef, chunks => [...chunks, chunk]))),
      );
      const code = yield* handle.exitCode;
      yield* wallSleep(POST_EXIT_STDOUT_DRAIN_MS);
      return { exitCode: code, stdout: mergeChunks(yield* Ref.get(chunksRef)) };
    }),
  );

  if (exitCode !== 0) {
    return yield* new ListChildDirectoriesError({
      message: `${commandName} exited with code ${String(exitCode)} while listing ${dirPath}`,
    });
  }

  return parseChildDirectoryStdout(stdout);
});

/** Parent of `dirPath` via Effect `Path.dirname`. */
export const parentDirectory = Effect.fn('parentDirectory')(function* (dirPath: string) {
  const pathApi = yield* Path;
  return normalizeDirPath(pathApi.dirname(dirPath));
});

/** Join `dirPath` / `childName` via Effect `Path.join`. */
export const joinDirectory = Effect.fn('joinDirectory')(function* (dirPath: string, childName: string) {
  const pathApi = yield* Path;
  return normalizeDirPath(pathApi.join(dirPath, childName));
});

/** Display path with `$HOME` replaced by `~`, trailing `/` for browse prefix. */
export const toTildeBrowsePrefix = (dirPath: string, homePath: string): string => {
  const normalized = normalizeDirPath(dirPath);
  const home = normalizeDirPath(homePath);
  if (normalized === home) {
    return '~/';
  }
  if (normalized.startsWith(`${home}/`) || normalized.startsWith(`${home}\\`)) {
    return `~${normalized.slice(home.length)}/`;
  }
  return `${normalized}/`;
};

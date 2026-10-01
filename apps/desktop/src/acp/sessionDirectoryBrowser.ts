/** Portable directory-browser helpers for create-session cwd picking. */
import { OS } from '@lib/context-services';
import { Effect, Schema, Stream } from 'effect';
import { Path } from 'effect/Path';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export const PARENT_DIR_ENTRY = '..' as const;

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

/** Parse `find` / `dir` stdout lines into sorted bare directory names. */
export const parseChildDirectoryLines = <E, R>(
  lines: Stream.Stream<string, E, R>,
): Effect.Effect<readonly string[], E, R> =>
  lines.pipe(
    Stream.map(rawLine => rawLine.trim()),
    Stream.filter(line => line.length > 0 && line !== '.' && line !== '..'),
    Stream.map(line => {
      const withoutDotSlash = line.startsWith('./') ? line.slice(2) : line;
      return withoutDotSlash.replaceAll('\\', '/').split('/').at(-1);
    }),
    Stream.filter(
      (basename): basename is string =>
        basename !== undefined && basename.length > 0 && basename !== '.' && basename !== '..',
    ),
    Stream.runCollect,
    Effect.map(names => [...new Set(names)]),
    Effect.map(names => names.sort((a, b) => a.localeCompare(b))),
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

  // exitCode resolves on close; stdout Queue.end follows in the same close handler.
  // Await exit first so we can skip parsing names on failure (still inside spawn scope).
  type Listed =
    | { readonly _tag: 'Failed'; readonly exitCode: ChildProcessSpawner.ExitCode }
    | { readonly _tag: 'Succeeded'; readonly names: readonly string[] };

  const listed: Listed = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const lines = handle.stdout.pipe(Stream.decodeText(), Stream.splitLines);
      const exitCode = yield* handle.exitCode;
      if (exitCode !== 0) {
        return { _tag: 'Failed', exitCode } as const;
      }
      return {
        _tag: 'Succeeded',
        names: yield* parseChildDirectoryLines(lines),
      } as const;
    }),
  );

  if (listed._tag === 'Failed') {
    return yield* new ListChildDirectoriesError({
      message: `${commandName} exited with code ${String(listed.exitCode)} while listing ${dirPath}`,
    });
  }

  return listed.names;
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

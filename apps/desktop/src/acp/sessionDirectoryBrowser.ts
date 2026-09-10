/** Portable directory-browser helpers for create-session cwd picking. */
import { OS } from '@lib/context-services';
import { Effect, Option } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

export const PARENT_DIR_ENTRY = '..' as const;

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

/** Child directory names under `dirPath` (name-only `readDirectory` + `stat` filter). */
export const listChildDirectories = Effect.fn('listChildDirectories')(function* (dirPath: string) {
  const fs = yield* FileSystem;
  const pathApi = yield* Path;
  const names = yield* fs.readDirectory(dirPath);
  const dirs: string[] = [];

  for (const name of names) {
    const info = yield* fs.stat(pathApi.join(dirPath, name)).pipe(Effect.option);
    if (Option.isSome(info) && info.value.type === 'Directory') {
      dirs.push(name);
    }
  }

  return dirs.sort((a, b) => a.localeCompare(b));
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

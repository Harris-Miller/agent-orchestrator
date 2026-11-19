/**
 * Tauri-backed Effect `FileSystem` Live via `@tauri-apps/plugin-fs`.
 *
 * Supported (production paths): access/exists, readFile/readFileString, writeFile/writeFileString,
 * makeDirectory, makeTempDirectory (via `$TEMP`), remove, rename, copyFile, readDirectory, stat, truncate.
 *
 * Unsupported for now (return PlatformError): open+seek handles, watch, chmod/chown, link/symlink,
 * other temp helpers, realPath, readLink, utimes, copy (recursive directory).
 */
import { join as tauriJoin, tempDir as tauriTempDir } from '@tauri-apps/api/path';
import {
  copyFile as tauriCopyFile,
  exists as tauriExists,
  lstat as tauriLstat,
  mkdir as tauriMkdir,
  readDir as tauriReadDir,
  readFile as tauriReadFile,
  remove as tauriRemove,
  rename as tauriRename,
  stat as tauriStat,
  truncate as tauriTruncate,
  writeFile as tauriWriteFile,
} from '@tauri-apps/plugin-fs';
import { ByteSize, Effect, FileSystem, Layer, Option, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';

const notSupported = (method: string): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    description: `FileSystem.${method} is not supported by the Tauri FileSystem Live`,
    method,
    module: 'FileSystem',
  });

const mapFsError = (method: string, pathOrDescriptor: number | string, cause: unknown): PlatformError.PlatformError => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const notFound =
    /not found|os error 2|No such file|ENOENT|path not allowed.*does not exist/i.test(message) ||
    (typeof cause === 'object' &&
      cause !== null &&
      'kind' in cause &&
      String(cause.kind).toLowerCase().includes('notfound'));

  return PlatformError.systemError({
    _tag: notFound ? 'NotFound' : 'Unknown',
    cause,
    description: message,
    method,
    module: 'FileSystem',
    pathOrDescriptor,
  });
};

const tryFs = <A>(method: string, path: string, run: () => Promise<A>): Effect.Effect<A, PlatformError.PlatformError> =>
  Effect.tryPromise({
    catch: cause => mapFsError(method, path, cause),
    try: run,
  });

const toFileInfo = (info: Awaited<ReturnType<typeof tauriStat>>): FileSystem.File.Info => ({
  atime: Option.fromNullishOr(info.atime),
  birthtime: Option.fromNullishOr(info.birthtime),
  blksize: Option.none(),
  blocks: Option.none(),
  dev: 0n,
  gid: Option.none(),
  ino: Option.none(),
  mode: info.mode ?? 0,
  mtime: Option.fromNullishOr(info.mtime),
  nlink: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(info.size),
  type: info.isDirectory ? 'Directory' : info.isFile ? 'File' : info.isSymlink ? 'SymbolicLink' : 'Unknown',
  uid: Option.none(),
});

const makeTauriFileSystem = (): FileSystem.FileSystem =>
  FileSystem.make({
    access: (path, options) =>
      tryFs('access', path, async () => {
        const present = await tauriExists(path);
        if (!present) {
          throw Object.assign(new Error(`ENOENT: no such file or directory, access '${path}'`), {
            kind: 'NotFound',
          });
        }
        if (options?.writable === true || options?.readable === true || options?.ok === true) {
          // Existence is the best capability check Tauri exposes without opening the file.
        }
      }),
    chmod: _path => Effect.fail(notSupported('chmod')),
    chown: _path => Effect.fail(notSupported('chown')),
    copy: _path => Effect.fail(notSupported('copy')),
    copyFile: (fromPath, toPath) => tryFs('copyFile', fromPath, () => tauriCopyFile(fromPath, toPath)),
    link: _path => Effect.fail(notSupported('link')),
    lstat: path => tryFs('lstat', path, async () => toFileInfo(await tauriLstat(path))),
    makeDirectory: (path, options) =>
      tryFs('makeDirectory', path, () => tauriMkdir(path, { recursive: options?.recursive })),
    makeTempDirectory: options =>
      tryFs('makeTempDirectory', options?.directory ?? 'temp', async () => {
        const base = options?.directory ?? (await tauriTempDir());
        const full = await tauriJoin(base, `${options?.prefix ?? 'tmp-'}${crypto.randomUUID()}`);
        await tauriMkdir(full, { recursive: true });
        return full;
      }),
    makeTempDirectoryScoped: () => Effect.fail(notSupported('makeTempDirectoryScoped')),
    makeTempFile: () => Effect.fail(notSupported('makeTempFile')),
    makeTempFileScoped: () => Effect.fail(notSupported('makeTempFileScoped')),
    open: _path => Effect.fail(notSupported('open')),
    readDirectory: (path, options) =>
      tryFs('readDirectory', path, async () => {
        if (options?.recursive === true) {
          throw new Error('FileSystem.readDirectory({ recursive: true }) is not supported by the Tauri Live');
        }
        const entries = await tauriReadDir(path);
        return entries.map(entry => entry.name);
      }),
    readDirectoryEntries: path =>
      tryFs('readDirectoryEntries', path, async () =>
        (await tauriReadDir(path)).map(entry => ({
          name: entry.name,
          type: entry.isDirectory ? 'Directory' : entry.isFile ? 'File' : entry.isSymlink ? 'SymbolicLink' : 'Unknown',
        })),
      ),
    readFile: path => tryFs('readFile', path, () => tauriReadFile(path)),
    readLink: _path => Effect.fail(notSupported('readLink')),
    realPath: _path => Effect.fail(notSupported('realPath')),
    remove: (path, options) =>
      tryFs('remove', path, () => tauriRemove(path, { recursive: options?.recursive })).pipe(
        Effect.catchIf(
          error => options?.force === true && error.reason._tag === 'NotFound',
          () => Effect.void,
        ),
      ),
    rename: (oldPath, newPath) => tryFs('rename', oldPath, () => tauriRename(oldPath, newPath)),
    stat: path => tryFs('stat', path, async () => toFileInfo(await tauriStat(path))),
    symlink: _path => Effect.fail(notSupported('symlink')),
    truncate: (path, length) => tryFs('truncate', path, () => tauriTruncate(path, length)),
    utimes: _path => Effect.fail(notSupported('utimes')),
    watch: () => Stream.fail(notSupported('watch')),
    writeFile: (path, data) => tryFs('writeFile', path, () => tauriWriteFile(path, data)),
  });

/** Tauri `FileSystem` Layer. */
export const FileSystemLive = Layer.succeed(FileSystem.FileSystem, makeTauriFileSystem());

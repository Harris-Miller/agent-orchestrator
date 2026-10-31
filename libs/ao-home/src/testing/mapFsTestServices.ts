import { AtomicFile, OS } from '@lib/context-services';
import { Effect, Layer, Sink, Stream } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import type { File, FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

export type MapFsEntry = { readonly content: string; readonly kind: 'file' } | { readonly kind: 'dir' };

const DEFAULT_HOMEDIR = '/home/operator';

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    description: 'No such file or directory',
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

const alreadyExists = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'AlreadyExists',
    description: 'File exists',
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

/** Lock tests only need open/`wx` side effects; handle methods are unused. */
const noopFile = {} as File;

export type MapFsOptions = {
  /** `FileSystem.remove` fails (PermissionDenied) for these path prefixes. */
  readonly failRemoveUnder?: readonly string[];
};

const mapFsLayer = (store: Map<string, MapFsEntry>, fsOptions: MapFsOptions = {}) => {
  const blockedRemoval = fsOptions.failRemoveUnder ?? [];
  return layerNoop({
    copyFile: (fromPath, toPath) =>
      Effect.gen(function* () {
        const entry = store.get(fromPath);
        if (entry?.kind !== 'file') {
          return yield* notFound('copyFile', fromPath);
        }
        store.set(toPath, { content: entry.content, kind: 'file' });
      }),
    exists: path => Effect.succeed(store.has(path)),
    makeDirectory: path =>
      Effect.sync(() => {
        store.set(path, { kind: 'dir' });
      }),
    makeTempDirectory: options =>
      Effect.sync(() => {
        const path = `${options?.directory ?? '/tmp'}/${options?.prefix ?? 'tmp-'}${String(store.size)}`;
        store.set(path, { kind: 'dir' });
        return path;
      }),
    open: (path, options) =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          if (options?.flag === 'wx' && store.has(path)) {
            return yield* alreadyExists('open', path);
          }
          if (options?.flag === 'wx') {
            store.set(path, { content: '', kind: 'file' });
          } else if (!store.has(path)) {
            return yield* notFound('open', path);
          }
          return noopFile;
        }),
        () => Effect.void,
      ),
    writeFile: (path, data) =>
      Effect.sync(() => {
        store.set(path, { content: new TextDecoder().decode(data), kind: 'file' });
      }),
    readFileString: path => {
      const entry = store.get(path);
      if (entry?.kind === 'file') {
        return Effect.succeed(entry.content);
      }
      return notFound('readFileString', path);
    },
    remove: (path, options) =>
      Effect.suspend(() => {
        if (blockedRemoval.some(prefix => path.startsWith(prefix))) {
          return Effect.fail(
            PlatformError.systemError({
              _tag: 'PermissionDenied',
              description: 'Permission denied',
              method: 'remove',
              module: 'FileSystem',
              pathOrDescriptor: path,
            }),
          );
        }
        return Effect.sync(() => {
          const present = store.has(path) || [...store.keys()].some(key => key.startsWith(`${path}/`));
          if (!present) {
            if (options?.force === true) {
              return;
            }
            throw notFound('remove', path);
          }
          // oxlint-disable-next-line unicorn/no-useless-spread -- Deleting during iteration requires a snapshot.
          for (const key of [...store.keys()]) {
            if (key === path || key.startsWith(`${path}/`)) {
              store.delete(key);
            }
          }
        });
      }),
    writeFileString: (path, data) =>
      Effect.sync(() => {
        store.set(path, { content: data, kind: 'file' });
      }),
  });
};

/** Always-ok spawner for AO-home chmod during materialize / BROWSER helper tests. */
const chmodOkSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.succeed(
      ChildProcessSpawner.makeHandle({
        all: Stream.empty,
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        pid: ChildProcessSpawner.ProcessId(1),
        stderr: Stream.empty,
        stdin: Sink.drain,
        stdout: Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    ),
  ),
);

/** Map-backed atomic replace: a single store write, so readers never see a partial document. */
const mapAtomicFileLayer = (store: Map<string, MapFsEntry>) =>
  Layer.succeed(AtomicFile, {
    replaceFileString: (path, content) =>
      Effect.sync(() => {
        store.set(path, { content, kind: 'file' });
      }),
  });

/** In-memory FileSystem + Path + OS + AtomicFile (+ chmod-ok spawner) for ao-home tests. */
export const mapFsTestServices = (
  store: Map<string, MapFsEntry>,
  options: MapFsOptions = {},
): Layer.Layer<AtomicFile | ChildProcessSpawner.ChildProcessSpawner | FileSystem | OS | Path> => {
  const osLayer = Layer.succeed(OS, {
    arch: () => 'arm64',
    cwd: () => DEFAULT_HOMEDIR,
    env: () => ({}),
    homedir: () => DEFAULT_HOMEDIR,
    platform: () => 'linux',
  });
  return Layer.mergeAll(
    posixPathLayer,
    mapFsLayer(store, options),
    mapAtomicFileLayer(store),
    chmodOkSpawnerLayer,
  ).pipe(Layer.provideMerge(osLayer));
};

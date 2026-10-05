import { OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import type { File, FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

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

const mapFsLayer = (store: Map<string, MapFsEntry>) =>
  layerNoop({
    exists: path => Effect.succeed(store.has(path)),
    makeDirectory: path =>
      Effect.sync(() => {
        store.set(path, { kind: 'dir' });
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
    readFileString: path => {
      const entry = store.get(path);
      if (entry?.kind === 'file') {
        return Effect.succeed(entry.content);
      }
      return notFound('readFileString', path);
    },
    remove: (path, options) =>
      Effect.sync(() => {
        const present = store.has(path) || [...store.keys()].some(key => key.startsWith(`${path}/`));
        if (!present) {
          if (options?.force === true) {
            return;
          }
          throw notFound('remove', path);
        }
        for (const key of [...store.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) {
            store.delete(key);
          }
        }
      }),
    writeFileString: (path, data) =>
      Effect.sync(() => {
        store.set(path, { content: data, kind: 'file' });
      }),
  });

/** In-memory FileSystem + Path + OS for adapter-roster lock tests. */
export const mapFsTestServices = (store: Map<string, MapFsEntry>): Layer.Layer<FileSystem | OS | Path> => {
  const osLayer = Layer.succeed(OS, {
    cwd: () => DEFAULT_HOMEDIR,
    env: () => ({}),
    homedir: () => DEFAULT_HOMEDIR,
    platform: () => 'linux',
  });
  return Layer.mergeAll(posixPathLayer, mapFsLayer(store)).pipe(Layer.provideMerge(osLayer));
};

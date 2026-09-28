import { Effect, FileSystem, Layer, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';

import type { IpcClient } from './protocol/ipcClient.ts';

const mapIpcError = (method: string, path: string, cause: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    cause,
    description: cause instanceof Error ? cause.message : String(cause),
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

const unsupported = (method: string): Effect.Effect<never> =>
  Effect.die(`FileSystem.${method} not supported on vscode Host`);

/**
 * IPC FileSystem subset for ao-home / Providers paths; other methods die.
 */
export const makeFileSystemLive = (client: IpcClient): Layer.Layer<FileSystem.FileSystem> =>
  Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({
      // Loud stubs for anything else harness might accidentally call.
      access: path => unsupported(`access(${path})`),
      chmod: path => unsupported(`chmod(${path})`),
      chown: path => unsupported(`chown(${path})`),
      copy: path => unsupported(`copy(${path})`),
      copyFile: path => unsupported(`copyFile(${path})`),
      exists: path =>
        client
          .request(id => ({ _tag: 'FsExists' as const, id, path }))
          .pipe(
            Effect.mapError(cause => mapIpcError('exists', path, cause)),
            Effect.flatMap(response => {
              if (response._tag === 'FsExistsResult') {
                return Effect.succeed(response.exists);
              }
              return Effect.fail(mapIpcError('exists', path, new Error(response._tag)));
            }),
          ),
      glob: pattern => unsupported(`glob(${pattern})`),
      link: path => unsupported(`link(${path})`),
      makeDirectory: (path, options) =>
        client
          .request(id => ({
            _tag: 'FsMakeDirectory' as const,
            id,
            options: options?.recursive === undefined ? undefined : { recursive: options.recursive },
            path,
          }))
          .pipe(
            Effect.mapError(cause => mapIpcError('makeDirectory', path, cause)),
            Effect.asVoid,
          ),
      makeTempDirectory: options =>
        client
          .request(id => ({
            _tag: 'FsMakeTempDirectory' as const,
            id,
            options:
              options === undefined
                ? undefined
                : {
                    directory: options.directory,
                    prefix: options.prefix,
                  },
          }))
          .pipe(
            Effect.mapError(cause => mapIpcError('makeTempDirectory', options?.directory ?? 'temp', cause)),
            Effect.flatMap(response => {
              if (response._tag === 'FsMakeTempDirectoryResult') {
                return Effect.succeed(response.path);
              }
              return Effect.fail(
                mapIpcError('makeTempDirectory', options?.directory ?? 'temp', new Error(response._tag)),
              );
            }),
          ),
      makeTempDirectoryScoped: () => unsupported('makeTempDirectoryScoped'),
      makeTempFile: () => unsupported('makeTempFile'),
      makeTempFileScoped: () => unsupported('makeTempFileScoped'),
      open: path => unsupported(`open(${path})`),
      readDirectory: path => unsupported(`readDirectory(${path})`),
      readFile: path => unsupported(`readFile(${path})`),
      readFileString: path =>
        client
          .request(id => ({ _tag: 'FsReadFileString' as const, id, path }))
          .pipe(
            Effect.mapError(cause => mapIpcError('readFileString', path, cause)),
            Effect.flatMap(response => {
              if (response._tag === 'FsReadFileStringResult') {
                return Effect.succeed(response.content);
              }
              return Effect.fail(mapIpcError('readFileString', path, new Error(response._tag)));
            }),
          ),
      readLink: path => unsupported(`readLink(${path})`),
      realPath: path => unsupported(`realPath(${path})`),
      remove: (path, options) =>
        client
          .request(id => ({
            _tag: 'FsRemove' as const,
            id,
            options: options?.recursive === undefined ? undefined : { recursive: options.recursive },
            path,
          }))
          .pipe(
            Effect.mapError(cause => mapIpcError('remove', path, cause)),
            Effect.asVoid,
          ),
      rename: path => unsupported(`rename(${path})`),
      stat: path => unsupported(`stat(${path})`),
      symlink: path => unsupported(`symlink(${path})`),
      truncate: path => unsupported(`truncate(${path})`),
      utimes: path => unsupported(`utimes(${path})`),
      watch: path => Stream.die(`FileSystem.watch(${path}) not supported on vscode Host`),
      writeFileString: (path, content) =>
        client
          .request(id => ({ _tag: 'FsWriteFileString' as const, content, id, path }))
          .pipe(
            Effect.mapError(cause => mapIpcError('writeFileString', path, cause)),
            Effect.asVoid,
          ),
    }),
  );

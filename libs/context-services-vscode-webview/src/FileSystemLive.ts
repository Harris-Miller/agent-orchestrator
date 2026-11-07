import { ByteSize, Effect, FileSystem, Layer, Option, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';

import type { IpcClient } from './protocol/ipcClient.ts';
import { bytesToArrayBuffer } from './protocol/messages.ts';
import type { HostIpcRequestInput, HostIpcRequestTag, HostIpcResult } from './protocol/messages.ts';

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

const fsIpc = <T extends HostIpcRequestTag>(args: {
  readonly client: IpcClient;
  readonly method: string;
  readonly path: string;
  readonly request: HostIpcRequestInput<T>;
}): Effect.Effect<HostIpcResult<T>, PlatformError.PlatformError> =>
  args.client.request(args.request).pipe(Effect.mapError(cause => mapIpcError(args.method, args.path, cause)));

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
      copyFile: Effect.fn('FileSystem.copyFile')(function* (fromPath: string, toPath: string) {
        yield* fsIpc({
          request: { _tag: 'FsCopyFile', fromPath, toPath },
          client,
          method: 'copyFile',
          path: fromPath,
        });
      }),
      exists: Effect.fn('FileSystem.exists')(function* (path: string) {
        const result = yield* fsIpc({ client, method: 'exists', path, request: { _tag: 'FsExists', path } });
        return result.exists;
      }),
      glob: pattern => unsupported(`glob(${pattern})`),
      link: path => unsupported(`link(${path})`),
      makeDirectory: Effect.fn('FileSystem.makeDirectory')(function* (
        path: string,
        options?: { readonly recursive?: boolean },
      ) {
        yield* fsIpc({
          request: {
            _tag: 'FsMakeDirectory',
            options: options?.recursive === undefined ? undefined : { recursive: options.recursive },
            path,
          },
          client,
          method: 'makeDirectory',
          path,
        });
      }),
      makeTempDirectory: Effect.fn('FileSystem.makeTempDirectory')(function* (options?: {
        readonly directory?: string;
        readonly prefix?: string;
      }) {
        const path = options?.directory ?? 'temp';
        const result = yield* fsIpc({
          client,
          method: 'makeTempDirectory',
          path,
          request: {
            _tag: 'FsMakeTempDirectory',
            options:
              options === undefined
                ? undefined
                : {
                    directory: options.directory,
                    prefix: options.prefix,
                  },
          },
        });
        return result.path;
      }),
      makeTempDirectoryScoped: () => unsupported('makeTempDirectoryScoped'),
      makeTempFile: () => unsupported('makeTempFile'),
      makeTempFileScoped: () => unsupported('makeTempFileScoped'),
      open: path => unsupported(`open(${path})`),
      readDirectory: path => unsupported(`readDirectory(${path})`),
      readFile: Effect.fn('FileSystem.readFile')(function* (path: string) {
        const { bytes } = yield* fsIpc({ client, method: 'readFile', path, request: { _tag: 'FsReadFile', path } });
        if (bytes instanceof Uint8Array) {
          return bytes;
        }
        if (bytes instanceof ArrayBuffer) {
          return new Uint8Array(bytes);
        }
        if (ArrayBuffer.isView(bytes)) {
          return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        }
        return yield* mapIpcError('readFile', path, new Error('FsReadFileResult bytes are not binary'));
      }),
      readFileString: Effect.fn('FileSystem.readFileString')(function* (path: string) {
        const result = yield* fsIpc({
          client,
          method: 'readFileString',
          path,
          request: { _tag: 'FsReadFileString', path },
        });
        return result.content;
      }),
      readLink: path => unsupported(`readLink(${path})`),
      realPath: path => unsupported(`realPath(${path})`),
      remove: Effect.fn('FileSystem.remove')(function* (path: string, options?: { readonly recursive?: boolean }) {
        yield* fsIpc({
          request: {
            _tag: 'FsRemove',
            options: options?.recursive === undefined ? undefined : { recursive: options.recursive },
            path,
          },
          client,
          method: 'remove',
          path,
        });
      }),
      rename: path => unsupported(`rename(${path})`),
      stat: Effect.fn('FileSystem.stat')(function* (path: string) {
        const response = yield* fsIpc({ client, method: 'stat', path, request: { _tag: 'FsStat', path } });
        const toDate = (ms: number | undefined): Option.Option<Date> =>
          Option.map(Option.fromNullishOr(ms), value => new Date(value));
        const info: FileSystem.File.Info = {
          atime: toDate(response.atime),
          birthtime: toDate(response.birthtime),
          blksize: Option.none(),
          blocks: Option.none(),
          dev: 0n,
          gid: Option.none(),
          ino: Option.none(),
          mode: 0,
          mtime: toDate(response.mtime),
          nlink: Option.none(),
          rdev: Option.none(),
          size: ByteSize.bytes(response.size),
          type: response.type,
          uid: Option.none(),
        };
        return info;
      }),
      symlink: path => unsupported(`symlink(${path})`),
      truncate: path => unsupported(`truncate(${path})`),
      utimes: path => unsupported(`utimes(${path})`),
      watch: path => Stream.die(`FileSystem.watch(${path}) not supported on vscode Host`),
      writeFile: Effect.fn('FileSystem.writeFile')(function* (path: string, data: Uint8Array) {
        yield* fsIpc({
          request: { _tag: 'FsWriteFile', bytes: bytesToArrayBuffer(data), path },
          client,
          method: 'writeFile',
          path,
        });
      }),
      writeFileString: Effect.fn('FileSystem.writeFileString')(function* (path: string, content: string) {
        yield* fsIpc({
          request: { _tag: 'FsWriteFileString', content, path },
          client,
          method: 'writeFileString',
          path,
        });
      }),
    }),
  );

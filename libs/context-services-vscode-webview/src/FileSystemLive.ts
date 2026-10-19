import { ByteSize, Effect, FileSystem, Layer, Option, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';

import type { IpcClient } from './protocol/ipcClient.ts';
import type { IpcMessage } from './protocol/messages.ts';

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

const fsIpc = <A>(args: {
  readonly build: (id: string) => IpcMessage;
  readonly client: IpcClient;
  readonly decode: (response: IpcMessage) => A | undefined;
  readonly method: string;
  readonly path: string;
}): Effect.Effect<A, PlatformError.PlatformError> =>
  args.client.request(args.build).pipe(
    Effect.mapError(cause => mapIpcError(args.method, args.path, cause)),
    Effect.flatMap(response => {
      const decoded = args.decode(response);
      return decoded !== undefined
        ? Effect.succeed(decoded)
        : Effect.fail(mapIpcError(args.method, args.path, new Error(response._tag)));
    }),
  );

const fsIpcVoid = (args: {
  readonly build: (id: string) => IpcMessage;
  readonly client: IpcClient;
  readonly method: string;
  readonly path: string;
}): Effect.Effect<void, PlatformError.PlatformError> =>
  args.client.request(args.build).pipe(
    Effect.mapError(cause => mapIpcError(args.method, args.path, cause)),
    Effect.asVoid,
  );

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
      exists: Effect.fn('FileSystem.exists')(function* (path: string) {
        return yield* fsIpc({
          build: id => ({ _tag: 'FsExists', id, path }),
          client,
          decode: response => (response._tag === 'FsExistsResult' ? response.exists : undefined),
          method: 'exists',
          path,
        });
      }),
      glob: pattern => unsupported(`glob(${pattern})`),
      link: path => unsupported(`link(${path})`),
      makeDirectory: Effect.fn('FileSystem.makeDirectory')(function* (
        path: string,
        options?: { readonly recursive?: boolean },
      ) {
        yield* fsIpcVoid({
          build: id => ({
            _tag: 'FsMakeDirectory',
            id,
            options: options?.recursive === undefined ? undefined : { recursive: options.recursive },
            path,
          }),
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
        return yield* fsIpc({
          build: id => ({
            _tag: 'FsMakeTempDirectory',
            id,
            options:
              options === undefined
                ? undefined
                : {
                    directory: options.directory,
                    prefix: options.prefix,
                  },
          }),
          client,
          decode: response => (response._tag === 'FsMakeTempDirectoryResult' ? response.path : undefined),
          method: 'makeTempDirectory',
          path,
        });
      }),
      makeTempDirectoryScoped: () => unsupported('makeTempDirectoryScoped'),
      makeTempFile: () => unsupported('makeTempFile'),
      makeTempFileScoped: () => unsupported('makeTempFileScoped'),
      open: path => unsupported(`open(${path})`),
      readDirectory: path => unsupported(`readDirectory(${path})`),
      readFile: path => unsupported(`readFile(${path})`),
      readFileString: Effect.fn('FileSystem.readFileString')(function* (path: string) {
        return yield* fsIpc({
          build: id => ({ _tag: 'FsReadFileString', id, path }),
          client,
          decode: response => (response._tag === 'FsReadFileStringResult' ? response.content : undefined),
          method: 'readFileString',
          path,
        });
      }),
      readLink: path => unsupported(`readLink(${path})`),
      realPath: path => unsupported(`realPath(${path})`),
      remove: Effect.fn('FileSystem.remove')(function* (path: string, options?: { readonly recursive?: boolean }) {
        yield* fsIpcVoid({
          build: id => ({
            _tag: 'FsRemove',
            id,
            options: options?.recursive === undefined ? undefined : { recursive: options.recursive },
            path,
          }),
          client,
          method: 'remove',
          path,
        });
      }),
      rename: path => unsupported(`rename(${path})`),
      stat: Effect.fn('FileSystem.stat')(function* (path: string) {
        return yield* fsIpc({
          build: id => ({ _tag: 'FsStat', id, path }),
          client,
          decode: (response): FileSystem.File.Info | undefined => {
            if (response._tag !== 'FsStatResult') {
              return undefined;
            }
            const toDate = (ms: number | undefined): Option.Option<Date> =>
              Option.map(Option.fromNullishOr(ms), value => new Date(value));
            return {
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
          },
          method: 'stat',
          path,
        });
      }),
      symlink: path => unsupported(`symlink(${path})`),
      truncate: path => unsupported(`truncate(${path})`),
      utimes: path => unsupported(`utimes(${path})`),
      watch: path => Stream.die(`FileSystem.watch(${path}) not supported on vscode Host`),
      writeFileString: Effect.fn('FileSystem.writeFileString')(function* (path: string, content: string) {
        yield* fsIpcVoid({
          build: id => ({ _tag: 'FsWriteFileString', content, id, path }),
          client,
          method: 'writeFileString',
          path,
        });
      }),
    }),
  );

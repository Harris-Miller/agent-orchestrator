import { assert, describe, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { readFileSync } from 'node:fs';

import { connectFakePeers } from '../protocol/fakePeer.testing.ts';
import { decodeIpcMessage, encodeIpcMessage, IpcClient, IpcMessage, serveHostIpc } from '../protocol/index.ts';
import type { HostIpcHandlers, IpcPort } from '../protocol/index.ts';

/** Today's wire (HEAD 81e8fb0): tag → sorted field names. Must not change. */
const WIRE_FIELD_NAMES = {
  AppExit: ['_tag', 'id'],
  AppExitResult: ['_tag', 'id'],
  BundledResolve: ['_tag', 'id', 'resourcePath'],
  BundledResolveResult: ['_tag', 'id', 'path'],
  Error: ['_tag', 'id', 'message'],
  Exit: ['_tag', 'code', 'handleId'],
  FileDialogPickFiles: ['_tag', 'filters', 'id', 'multiple'],
  FileDialogPickFilesResult: ['_tag', 'id', 'paths'],
  FsAtomicReplaceFileString: ['_tag', 'content', 'id', 'path'],
  FsAtomicReplaceFileStringResult: ['_tag', 'id'],
  FsCopyFile: ['_tag', 'fromPath', 'id', 'toPath'],
  FsCopyFileResult: ['_tag', 'id'],
  FsExists: ['_tag', 'id', 'path'],
  FsExistsResult: ['_tag', 'exists', 'id'],
  FsMakeDirectory: ['_tag', 'id', 'options', 'path'],
  FsMakeDirectoryResult: ['_tag', 'id'],
  FsMakeTempDirectory: ['_tag', 'id', 'options'],
  FsMakeTempDirectoryResult: ['_tag', 'id', 'path'],
  FsReadFile: ['_tag', 'id', 'path'],
  FsReadFileResult: ['_tag', 'bytes', 'id'],
  FsReadFileString: ['_tag', 'id', 'path'],
  FsReadFileStringResult: ['_tag', 'content', 'id'],
  FsRemove: ['_tag', 'id', 'options', 'path'],
  FsRemoveResult: ['_tag', 'id'],
  FsStat: ['_tag', 'id', 'path'],
  FsStatResult: ['_tag', 'atime', 'birthtime', 'id', 'mtime', 'size', 'type'],
  FsWriteFile: ['_tag', 'bytes', 'id', 'path'],
  FsWriteFileResult: ['_tag', 'id'],
  FsWriteFileString: ['_tag', 'content', 'id', 'path'],
  FsWriteFileStringResult: ['_tag', 'id'],
  HttpFetch: ['_tag', 'body', 'headers', 'id', 'method', 'url'],
  HttpFetchResult: ['_tag', 'body', 'headers', 'id', 'status', 'statusText'],
  Kill: ['_tag', 'handleId', 'id'],
  KillResult: ['_tag', 'id'],
  OpenFile: ['_tag', 'id', 'path'],
  OpenFileResult: ['_tag', 'id'],
  OpenImageData: ['_tag', 'base64', 'id', 'mimeType'],
  OpenImageDataResult: ['_tag', 'id'],
  OpenUrl: ['_tag', 'id', 'url'],
  OpenUrlResult: ['_tag', 'id'],
  OsSnapshot: ['_tag', 'id'],
  OsSnapshotResult: ['_tag', 'arch', 'cwd', 'env', 'homedir', 'id', 'platform'],
  Spawn: ['_tag', 'args', 'command', 'id', 'options'],
  SpawnResult: ['_tag', 'handleId', 'id', 'pid'],
  StderrChunk: ['_tag', 'bytes', 'handleId'],
  StderrEnd: ['_tag', 'handleId'],
  StdinChunk: ['_tag', 'bytes', 'handleId'],
  StdinEnd: ['_tag', 'handleId'],
  StdoutChunk: ['_tag', 'bytes', 'handleId'],
  StdoutEnd: ['_tag', 'handleId'],
  WindowFocus: ['_tag', 'id'],
  WindowFocusResult: ['_tag', 'focused', 'id'],
  WorkspaceFolders: ['_tag', 'id'],
  WorkspaceFoldersChanged: ['_tag', 'paths'],
  WorkspaceFoldersResult: ['_tag', 'id', 'paths'],
};

const sortRequired = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortRequired);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key === 'required' && Array.isArray(child) ? child.toSorted() : sortRequired(child),
      ]),
    );
  }
  return value;
};

const unused = (): Promise<never> => Promise.reject(new Error('unused'));

/** Complete handler map where every request rejects; tests override what they exercise. */
const fakeHandlers = (overrides: Partial<HostIpcHandlers> = {}): HostIpcHandlers => ({
  AppExit: unused,
  BundledResolve: unused,
  FileDialogPickFiles: unused,
  FsAtomicReplaceFileString: unused,
  FsCopyFile: unused,
  FsExists: unused,
  FsMakeDirectory: unused,
  FsMakeTempDirectory: unused,
  FsReadFile: unused,
  FsReadFileString: unused,
  FsRemove: unused,
  FsStat: unused,
  FsWriteFile: unused,
  FsWriteFileString: unused,
  HttpFetch: unused,
  Kill: unused,
  OpenFile: unused,
  OpenImageData: unused,
  OpenUrl: unused,
  OsSnapshot: unused,
  Spawn: unused,
  StdinChunk: () => undefined,
  StdinEnd: () => undefined,
  WindowFocus: unused,
  WorkspaceFolders: unused,
  ...overrides,
});

/** Webview-end client served by `handlers` over an in-memory port pair; torn down with the test scope. */
const connect = (handlers: HostIpcHandlers) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const [webview, extension] = connectFakePeers();
      const client = new IpcClient(webview);
      const stop = serveHostIpc(extension, handlers);
      return { client, extension, stop, webview };
    }),
    ({ client, stop }) =>
      Effect.sync(() => {
        stop();
        client.dispose();
      }),
  );

type Received = { readonly message: IpcMessage; readonly transfer: readonly ArrayBuffer[] | undefined };

/** Raw listener recording every decoded message (and transfer list) arriving on `port`. */
const record = (port: IpcPort): Received[] => {
  const received: Received[] = [];
  port.onMessage((raw, transfer) => {
    received.push({ message: decodeIpcMessage(raw), transfer });
  });
  return received;
};

/** Let pending handler promises settle (real macrotask, not the TestClock). */
const settle = Effect.promise(
  () =>
    new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    }),
);

/** Compile-time checks on the table-derived interfaces (never called; `tsc` checks the file). */
export const typeLevelChecks = (client: IpcClient): void => {
  // @ts-expect-error -- `path` is the Result's field, not the request's
  client.request({ _tag: 'BundledResolve', path: 'x' });
  // @ts-expect-error -- misspelled optional field (`multiple`)
  client.request({ _tag: 'FileDialogPickFiles', multi: true });
  // @ts-expect-error -- the client allocates `id`
  client.request({ _tag: 'AppExit', id: 'x' });
  // @ts-expect-error -- a push is not a request
  client.request({ _tag: 'StdinEnd', handleId: 'h' });
  // @ts-expect-error -- a request is not a push
  client.post({ _tag: 'OpenUrl', id: 'x', url: 'u' });
  const { OpenUrl: _omitted, ...missingOpenUrl } = fakeHandlers();
  // @ts-expect-error -- every request needs a handler
  serveHostIpc(connectFakePeers()[1], missingOpenUrl);
};

describe('Host IPC request table', () => {
  it.effect('round-trips a typed request and its Result', () =>
    Effect.gen(function* () {
      const { client } = yield* connect(
        fakeHandlers({ BundledResolve: request => Promise.resolve({ path: `/abs/${request.resourcePath}` }) }),
      );
      const result = yield* client.request({ _tag: 'BundledResolve', resourcePath: 'a/b' });
      assert.strictEqual(result._tag, 'BundledResolveResult');
      assert.strictEqual(result.path, '/abs/a/b');
    }),
  );

  it.effect('answers a rejected handler with Error', () =>
    Effect.gen(function* () {
      const { client } = yield* connect(
        fakeHandlers({
          OpenUrl: () => {
            throw new Error('boom');
          },
        }),
      );
      const error = yield* client.request({ _tag: 'OpenUrl', url: 'https://example.com' }).pipe(Effect.flip);
      assert.strictEqual(error._tag, 'IpcClientError');
      assert.strictEqual(error.message, 'boom');
    }),
  );

  it.effect('fails a request answered with another Result tag', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if ('id' in message) {
          extension.postMessage(encodeIpcMessage({ _tag: 'AppExitResult', id: message.id }));
        }
      });
      const client = new IpcClient(webview);
      const error = yield* client.request({ _tag: 'OpenUrl', url: 'https://example.com' }).pipe(Effect.flip);
      assert.strictEqual(error._tag, 'IpcClientError');
      assert.match(error.message, /^Unexpected OpenUrl response: AppExitResult$/);
    }),
  );

  it.effect('fails a void-Result request answered with another Result tag', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if ('id' in message) {
          extension.postMessage(encodeIpcMessage({ _tag: 'FsExistsResult', exists: true, id: message.id }));
        }
      });
      const client = new IpcClient(webview);
      const error = yield* client.request({ _tag: 'FsCopyFile', fromPath: '/a', toPath: '/b' }).pipe(Effect.flip);
      assert.match(error.message, /^Unexpected FsCopyFile response: FsExistsResult$/);
    }),
  );

  it.effect('delivers a webview push to its handler without a reply', () =>
    Effect.gen(function* () {
      const ended: string[] = [];
      const { client, webview } = yield* connect(
        fakeHandlers({
          StdinEnd: push => {
            ended.push(push.handleId);
          },
        }),
      );
      const replies = record(webview);
      client.post({ _tag: 'StdinEnd', handleId: 'h' });
      yield* settle;
      assert.deepStrictEqual(ended, ['h']);
      assert.deepStrictEqual(replies, []);
    }),
  );

  it.effect('ignores extension pushes, Results and garbage', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const { webview } = yield* connect(
        fakeHandlers({
          OpenUrl: () => {
            calls.push('OpenUrl');
            return Promise.resolve({});
          },
          StdinEnd: () => {
            calls.push('StdinEnd');
          },
        }),
      );
      const replies = record(webview);
      webview.postMessage(encodeIpcMessage({ _tag: 'StdoutEnd', handleId: 'h' }));
      webview.postMessage(encodeIpcMessage({ _tag: 'OpenUrlResult', id: 'c-9' }));
      webview.postMessage({ nope: 1 });
      yield* settle;
      assert.deepStrictEqual(calls, []);
      assert.deepStrictEqual(replies, []);
    }),
  );

  it.effect('correlates concurrent requests', () =>
    Effect.gen(function* () {
      const { client } = yield* connect(
        fakeHandlers({
          Spawn: request =>
            Promise.resolve({ handleId: `h-${request.command}`, pid: request.command === 'a' ? 101 : 202 }),
        }),
      );
      const [a, b] = yield* Effect.all(
        [
          client.request({ _tag: 'Spawn', args: [], command: 'a' }),
          client.request({ _tag: 'Spawn', args: [], command: 'b' }),
        ],
        { concurrency: 'unbounded' },
      );
      assert.deepStrictEqual([a.handleId, a.pid], ['h-a', 101]);
      assert.deepStrictEqual([b.handleId, b.pid], ['h-b', 202]);
    }),
  );

  it.effect('transfers the binary payload of a Result', () =>
    Effect.gen(function* () {
      const bytes = new Uint8Array([1, 2, 3]).buffer;
      const { client, webview } = yield* connect(fakeHandlers({ FsReadFile: () => Promise.resolve({ bytes }) }));
      const replies = record(webview);
      const result = yield* client.request({ _tag: 'FsReadFile', path: '/f' });
      yield* settle;
      assert.strictEqual(result.bytes, bytes);
      assert.strictEqual(replies.length, 1);
      assert.deepStrictEqual(replies[0]?.transfer, [bytes]);
    }),
  );

  it.effect('stops serving after dispose', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const { stop, webview } = yield* connect(
        fakeHandlers({
          OpenUrl: () => {
            calls.push('OpenUrl');
            return Promise.resolve({});
          },
        }),
      );
      const replies = record(webview);
      stop();
      webview.postMessage(encodeIpcMessage({ _tag: 'OpenUrl', id: 'raw-1', url: 'https://example.com' }));
      yield* settle;
      assert.deepStrictEqual(calls, []);
      assert.deepStrictEqual(replies, []);
    }),
  );

  it.effect('answers an unencodable Result with Error', () =>
    Effect.gen(function* () {
      const { client } = yield* connect(
        fakeHandlers({
          FsStat: () => Promise.resolve({ size: 1, type: 'Bogus' } as unknown as { size: number; type: 'File' }),
        }),
      );
      const error = yield* client.request({ _tag: 'FsStat', path: '/f' }).pipe(Effect.flip);
      assert.strictEqual(error._tag, 'IpcClientError');
    }),
  );

  describe('wire pin', () => {
    it('keeps every tag and field name of the wire', () => {
      const actual = Object.fromEntries(
        Object.entries(IpcMessage.cases).map(([tag, schema]) => [tag, Object.keys(schema.fields).toSorted()]),
      );
      assert.deepStrictEqual(actual, WIRE_FIELD_NAMES);
    });

    it('keeps every field type, optionality and literal set of the wire', () => {
      const fixture: unknown = JSON.parse(readFileSync(new URL('hostIpcWire.fixture.json', import.meta.url), 'utf8'));
      const actual = Object.fromEntries(
        Object.entries(IpcMessage.cases).map(([tag, schema]) => [
          tag,
          sortRequired(Schema.toJsonSchemaDocument(schema).schema),
        ]),
      );
      assert.deepStrictEqual(actual, fixture);
    });
  });
});

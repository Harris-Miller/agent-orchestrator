import { assert, describe, it } from '@effect/vitest';
import { decodeIpcMessage, IpcClient, serveHostIpc } from '@lib/context-services-vscode-webview/protocol';
import type { IpcMessage, IpcPort } from '@lib/context-services-vscode-webview/protocol';
import { connectFakePeers } from '@lib/context-services-vscode-webview/testing';
import { Effect } from 'effect';
import { beforeEach, vi } from 'vitest';

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { captureStartupOtelEnv, makeHostIpcFulfillment } from '../hostFulfillment';
import { ProcessTracker } from '../processTracker';

const vscodeStub = vi.hoisted(() => ({
  commands: { executeCommand: vi.fn(() => Promise.resolve(undefined)) },
  env: { openExternal: vi.fn(() => Promise.resolve(true)) },
  FileType: { Directory: 2, File: 1 },
  Range: class {
    constructor(
      readonly startLine: number,
      readonly startCharacter: number,
      readonly endLine: number,
      readonly endCharacter: number,
    ) {}
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
    parse: (value: string) => ({ scheme: 'https', value }),
  },
  window: {
    showOpenDialog: vi.fn(() => Promise.resolve(undefined as undefined | { fsPath: string }[])),
    state: { focused: true },
  },
  workspace: { fs: { stat: vi.fn(() => Promise.resolve({ type: 1 })) } },
}));

vi.mock('vscode', () => vscodeStub);

type Folder = { readonly uri: { readonly fsPath: string; readonly scheme: string } };

/**
 * `IpcClient` (webview end) ↔ `serveHostIpc(makeHostIpcFulfillment(...))` (extension end) over an in-memory
 * port pair, in a fresh temp dir. Everything is released with the test scope.
 */
const makeFulfillment = (isExtensionDevelopment = false) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'hoa-host-fulfillment-'));
      const [webview, extension] = connectFakePeers();
      const tracker = new ProcessTracker();
      const state: { folders: readonly Folder[] | undefined } = { folders: undefined };
      const stop = serveHostIpc(
        extension,
        makeHostIpcFulfillment({
          asAbsolutePath: relativePath => join(tmp, relativePath),
          isExtensionDevelopment,
          port: extension,
          tracker,
          webviewId: 'wv-1',
          workspaceFolders: () => state.folders as never,
        }),
      );
      const client = new IpcClient(webview);
      return { client, state, stop, tmp, tracker, webview };
    }),
    ({ client, stop, tmp, tracker }) =>
      Effect.promise(async () => {
        stop();
        client.dispose();
        tracker.killAll();
        vi.unstubAllEnvs();
        await rm(tmp, { force: true, recursive: true });
      }),
  );

const fulfillment = makeFulfillment();

type Watched = {
  /**
   * Resolves once both `StdoutEnd` and `Exit` pushes have arrived (in either order: Node's `exit` may
   * fire before the child's stdio has drained).
   */
  readonly done: Effect.Effect<void>;
  readonly seen: { readonly message: IpcMessage; readonly transfer: readonly ArrayBuffer[] | undefined }[];
};

/** Raw recorder on the webview port: every message the extension end posts, in order. */
const watch = (port: IpcPort): Watched => {
  const seen: Watched['seen'] = [];
  const isDone = () => ['StdoutEnd', 'Exit'].every(tag => seen.some(({ message }) => message._tag === tag));
  let onDone: (() => void) | undefined;
  port.onMessage((raw, transfer) => {
    seen.push({ message: decodeIpcMessage(raw), transfer });
    if (isDone()) {
      onDone?.();
    }
  });
  const done = Effect.callback<void>(resume => {
    if (isDone()) {
      resume(Effect.void);
      return;
    }
    onDone = () => {
      resume(Effect.void);
    };
  });
  return { done, seen };
};

const exitCode = (seen: Watched['seen']): number | undefined =>
  seen.flatMap(({ message }) => (message._tag === 'Exit' ? [message.code] : []))[0];

const stdoutText = (seen: Watched['seen']): string =>
  Buffer.concat(
    seen.flatMap(({ message }) => (message._tag === 'StdoutChunk' ? [Buffer.from(message.bytes as ArrayBuffer)] : [])),
  ).toString('utf8');

/** Let the in-memory port finish delivering the current message (real macrotask, not the TestClock). */
const settle = Effect.promise(
  () =>
    new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    }),
);

const bytesOf = (values: readonly number[]): ArrayBuffer => new Uint8Array(values).buffer;

describe('Host IPC fulfillment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscodeStub.window.state.focused = true;
  });

  it.effect('round-trips text files through the Fs requests', () =>
    Effect.gen(function* () {
      const { client, tmp } = yield* fulfillment;
      const dir = join(tmp, 'a', 'b');
      const file = join(dir, 'f.txt');
      const copy = join(dir, 'g.txt');

      yield* client.request({ _tag: 'FsMakeDirectory', options: { recursive: true }, path: dir });
      yield* client.request({ _tag: 'FsWriteFileString', content: 'hello', path: file });
      assert.strictEqual((yield* client.request({ _tag: 'FsExists', path: file })).exists, true);
      assert.strictEqual((yield* client.request({ _tag: 'FsReadFileString', path: file })).content, 'hello');
      const info = yield* client.request({ _tag: 'FsStat', path: file });
      assert.strictEqual(info.type, 'File');
      assert.strictEqual(info.size, 5);
      yield* client.request({ _tag: 'FsCopyFile', fromPath: file, toPath: copy });
      assert.strictEqual(readFileSync(copy, 'utf8'), 'hello');
      yield* client.request({ _tag: 'FsRemove', options: { recursive: true }, path: join(tmp, 'a') });
      assert.strictEqual((yield* client.request({ _tag: 'FsExists', path: file })).exists, false);
    }),
  );

  it.effect('round-trips binary files and transfers the read bytes', () =>
    Effect.gen(function* () {
      const { client, tmp, webview } = yield* fulfillment;
      const file = join(tmp, 'f.bin');
      const watched = watch(webview);

      yield* client.request({ _tag: 'FsWriteFile', bytes: bytesOf([1, 2, 3]), path: file });
      const result = yield* client.request({ _tag: 'FsReadFile', path: file });
      yield* settle;

      assert.deepStrictEqual([...new Uint8Array(result.bytes as ArrayBuffer)], [1, 2, 3]);
      const reply = watched.seen.find(({ message }) => message._tag === 'FsReadFileResult');
      assert.deepStrictEqual(reply?.transfer, [result.bytes]);
    }),
  );

  it.effect('makes a temp directory under the requested directory', () =>
    Effect.gen(function* () {
      const { client, tmp } = yield* fulfillment;
      const { path } = yield* client.request({
        _tag: 'FsMakeTempDirectory',
        options: { directory: tmp, prefix: 'x-' },
      });
      assert.ok(path.startsWith(join(tmp, 'x-')));
      assert.ok(existsSync(path));
    }),
  );

  it.effect('answers a failed read with Error', () =>
    Effect.gen(function* () {
      const { client, tmp } = yield* fulfillment;
      const error = yield* client.request({ _tag: 'FsReadFileString', path: join(tmp, 'missing') }).pipe(Effect.flip);
      assert.strictEqual(error._tag, 'IpcClientError');
      assert.match(error.message, /ENOENT/);
    }),
  );

  it.effect('refuses an atomic replace outside provider state', () =>
    Effect.gen(function* () {
      const { client, tmp } = yield* fulfillment;
      const error = yield* client
        .request({ _tag: 'FsAtomicReplaceFileString', content: '{}', path: join(tmp, 'x.json') })
        .pipe(Effect.flip);
      assert.match(error.message, /Atomic replace refused/);
      assert.notInclude(error.message, tmp);
    }),
  );

  it.effect('atomically replaces provider state', () =>
    Effect.gen(function* () {
      const { client, tmp } = yield* fulfillment;
      vi.stubEnv(process.platform === 'win32' ? 'USERPROFILE' : 'HOME', tmp);
      const dir = join(tmp, '.hoa', 'providers', 'p');
      const path = join(dir, 'current.json');

      yield* client.request({ _tag: 'FsAtomicReplaceFileString', content: '{"a":1}', path });

      assert.strictEqual(readFileSync(path, 'utf8'), '{"a":1}');
      assert.deepStrictEqual(readdirSync(dir), ['current.json']);
    }),
  );

  it.effect('resolves bundled resources against the extension root', () =>
    Effect.gen(function* () {
      const { client, tmp } = yield* fulfillment;
      writeFileSync(join(tmp, 'res.txt'), 'r');

      const { path } = yield* client.request({ _tag: 'BundledResolve', resourcePath: 'res.txt' });
      assert.strictEqual(path, join(tmp, 'res.txt'));

      const error = yield* client.request({ _tag: 'BundledResolve', resourcePath: 'nope.txt' }).pipe(Effect.flip);
      assert.match(error.message, /Bundled resource missing/);
      assert.notInclude(error.message, 'nope.txt');
    }),
  );

  it.effect('snapshots the extension host OS', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      const snapshot = yield* client.request({ _tag: 'OsSnapshot' });
      assert.strictEqual(snapshot.platform, process.platform);
      assert.strictEqual(snapshot.homedir, homedir());
    }),
  );

  it.effect('keeps OTEL_* in the snapshot after another extension deletes it from process.env', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
      captureStartupOtelEnv();
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      const snapshot = yield* client.request({ _tag: 'OsSnapshot' });
      assert.strictEqual(snapshot.env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://127.0.0.1:4318');
    }),
  );

  // Exception to "don't assert on logging" (AGENTS.md): the warning is this feature's only observable behaviour.
  describe('dev OTLP export warning', () => {
    const snapshotWarnings = (opts: {
      readonly isExtensionDevelopment: boolean;
      readonly endpoint: string | undefined;
    }) =>
      Effect.gen(function* () {
        const { client } = yield* makeFulfillment(opts.isExtensionDevelopment);
        vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', opts.endpoint);
        captureStartupOtelEnv();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        yield* client.request({ _tag: 'OsSnapshot' });
        return warn.mock.calls.flat().map(String);
      }).pipe(Effect.ensuring(Effect.sync(() => vi.mocked(console.warn).mockRestore())));

    it.effect('warns in a dev build when the snapshot has no OTEL_EXPORTER_OTLP_ENDPOINT', () =>
      Effect.gen(function* () {
        const warnings = yield* snapshotWarnings({ isExtensionDevelopment: true, endpoint: undefined });
        assert.strictEqual(warnings.length, 1);
        assert.include(warnings[0], 'OTEL_EXPORTER_OTLP_ENDPOINT');
      }),
    );

    it.effect('stays quiet in a dev build when the snapshot has the endpoint', () =>
      Effect.gen(function* () {
        const warnings = yield* snapshotWarnings({ isExtensionDevelopment: true, endpoint: 'http://127.0.0.1:4318' });
        assert.deepStrictEqual(warnings, []);
      }),
    );

    it.effect('stays quiet in a prod build even without the endpoint', () =>
      Effect.gen(function* () {
        const warnings = yield* snapshotWarnings({ isExtensionDevelopment: false, endpoint: undefined });
        assert.deepStrictEqual(warnings, []);
      }),
    );
  });

  it.effect('reports VS Code window focus', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      assert.strictEqual((yield* client.request({ _tag: 'WindowFocus' })).focused, true);
      vscodeStub.window.state.focused = false;
      assert.strictEqual((yield* client.request({ _tag: 'WindowFocus' })).focused, false);
    }),
  );

  it.effect('reads Workspace folders per request', () =>
    Effect.gen(function* () {
      const { client, state } = yield* fulfillment;
      state.folders = [{ uri: { fsPath: '/ws/a', scheme: 'file' } }, { uri: { fsPath: 'x', scheme: 'vscode-vfs' } }];
      assert.deepStrictEqual((yield* client.request({ _tag: 'WorkspaceFolders' })).paths, ['/ws/a']);
      state.folders = [{ uri: { fsPath: '/ws/b', scheme: 'file' } }];
      assert.deepStrictEqual((yield* client.request({ _tag: 'WorkspaceFolders' })).paths, ['/ws/b']);
    }),
  );

  it.effect('opens URLs externally and fails when declined', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      const result = yield* client.request({ _tag: 'OpenUrl', url: 'https://example.com' });
      assert.strictEqual(result._tag, 'OpenUrlResult');

      vscodeStub.env.openExternal.mockResolvedValueOnce(false);
      const error = yield* client.request({ _tag: 'OpenUrl', url: 'https://example.com/private' }).pipe(Effect.flip);
      assert.match(error.message, /openExternal declined/);
      assert.notInclude(error.message, 'example.com');
    }),
  );

  it.effect('reveals directories and opens files', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      vscodeStub.workspace.fs.stat.mockResolvedValueOnce({ type: vscodeStub.FileType.Directory });
      yield* client.request({ _tag: 'OpenFile', path: '/some/dir' });
      assert.deepStrictEqual(vscodeStub.commands.executeCommand.mock.lastCall, [
        'revealInExplorer',
        { fsPath: '/some/dir', scheme: 'file' },
      ]);

      yield* client.request({ _tag: 'OpenFile', path: '/some/file.ts' });
      assert.deepStrictEqual(vscodeStub.commands.executeCommand.mock.lastCall, [
        'vscode.open',
        { fsPath: '/some/file.ts', scheme: 'file' },
      ]);
    }),
  );

  it.effect('jumps to the requested line of a file, clamped to line 1; directories ignore it', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      yield* client.request({ _tag: 'OpenFile', line: 14, path: '/some/file.ts' });
      assert.deepStrictEqual(vscodeStub.commands.executeCommand.mock.lastCall, [
        'vscode.open',
        { fsPath: '/some/file.ts', scheme: 'file' },
        { selection: new vscodeStub.Range(13, 0, 13, 0) },
      ]);
      yield* client.request({ _tag: 'OpenFile', line: 0, path: '/some/file.ts' });
      assert.deepStrictEqual(vscodeStub.commands.executeCommand.mock.lastCall?.[2], {
        selection: new vscodeStub.Range(0, 0, 0, 0),
      });
      vscodeStub.workspace.fs.stat.mockResolvedValueOnce({ type: vscodeStub.FileType.Directory });
      yield* client.request({ _tag: 'OpenFile', line: 5, path: '/some/dir' });
      assert.deepStrictEqual(vscodeStub.commands.executeCommand.mock.lastCall, [
        'revealInExplorer',
        { fsPath: '/some/dir', scheme: 'file' },
      ]);
    }),
  );

  it.effect('writes image data to a temp file and opens it', () =>
    Effect.gen(function* () {
      const { client, tmp } = yield* fulfillment;
      vi.stubEnv(process.platform === 'win32' ? 'TEMP' : 'TMPDIR', tmp);
      const base64 = Buffer.from([9, 8, 7]).toString('base64');

      yield* client.request({ _tag: 'OpenImageData', base64, mimeType: 'image/png' });

      const dir = join(tmp, 'hoa-images');
      const [name] = readdirSync(dir);
      assert.match(name ?? '', /^[0-9a-f]{24}\.png$/);
      assert.deepStrictEqual([...readFileSync(join(dir, name ?? ''))], [9, 8, 7]);
      assert.deepStrictEqual(vscodeStub.commands.executeCommand.mock.lastCall, [
        'vscode.open',
        { fsPath: join(dir, name ?? ''), scheme: 'file' },
      ]);
    }),
  );

  it.effect('picks files through the open dialog', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      assert.deepStrictEqual((yield* client.request({ _tag: 'FileDialogPickFiles' })).paths, []);
      const [singleOptions] = vscodeStub.window.showOpenDialog.mock.lastCall as unknown as [{ canSelectMany: boolean }];
      assert.strictEqual(singleOptions.canSelectMany, false);

      vscodeStub.window.showOpenDialog.mockResolvedValueOnce([{ fsPath: '/a.png' }, { fsPath: '/b.jpg' }]);
      const { paths } = yield* client.request({
        _tag: 'FileDialogPickFiles',
        filters: [{ extensions: ['png', 'jpg'], name: 'Images' }],
        multiple: true,
      });
      assert.deepStrictEqual(paths, ['/a.png', '/b.jpg']);
      const [options] = vscodeStub.window.showOpenDialog.mock.lastCall as unknown as [
        { canSelectMany: boolean; filters: unknown },
      ];
      assert.deepStrictEqual(options.filters, { Images: ['png', 'jpg'] });
      assert.strictEqual(options.canSelectMany, true);
    }),
  );

  it.effect('closes the sidebar on AppExit', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      const result = yield* client.request({ _tag: 'AppExit' });
      assert.strictEqual(result._tag, 'AppExitResult');
      assert.deepStrictEqual(vscodeStub.commands.executeCommand.mock.lastCall, ['workbench.action.closeSidebar']);
    }),
  );

  it.effect('fetches over HTTP from the extension host', () =>
    Effect.gen(function* () {
      const { client } = yield* fulfillment;
      const url = yield* Effect.acquireRelease(
        Effect.callback<{ readonly close: () => void; readonly url: string }>(resume => {
          const server = createServer((request, response) => {
            const chunks: Buffer[] = [];
            request.on('data', (chunk: Buffer) => chunks.push(chunk));
            request.on('end', () => {
              response.writeHead(201, 'Created', { 'x-echo': 'yes' });
              response.end(Buffer.concat(chunks));
            });
          });
          server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address !== null ? address.port : 0;
            resume(
              Effect.succeed({
                close: () => {
                  server.closeAllConnections();
                  server.close();
                },
                url: `http://127.0.0.1:${port}/echo`,
              }),
            );
          });
        }),
        ({ close }) => Effect.sync(close),
      ).pipe(Effect.map(({ url: serverUrl }) => serverUrl));

      const result = yield* client.request({
        _tag: 'HttpFetch',
        body: bytesOf([4, 5, 6]),
        headers: { 'content-type': 'application/octet-stream' },
        method: 'POST',
        url,
      });

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.statusText, 'Created');
      assert.strictEqual(result.headers['x-echo'], 'yes');
      assert.deepStrictEqual([...new Uint8Array(result.body as ArrayBuffer)], [4, 5, 6]);
    }),
  );

  it.effect('answers Spawn before streaming the child stdout and exit', () =>
    Effect.gen(function* () {
      const { client, webview } = yield* fulfillment;
      const watched = watch(webview);

      yield* client.request({ _tag: 'Spawn', args: ['-e', "process.stdout.write('hi')"], command: process.execPath });
      yield* watched.done;

      const tags = watched.seen.map(({ message }) => message._tag);
      assert.strictEqual(tags[0], 'SpawnResult');
      assert.ok(tags.includes('StdoutChunk'));
      assert.strictEqual(stdoutText(watched.seen), 'hi');
      assert.strictEqual(exitCode(watched.seen), 0);
    }),
  );

  it.effect('forwards stdin pushes to the child', () =>
    Effect.gen(function* () {
      const { client, webview } = yield* fulfillment;
      const watched = watch(webview);

      const { handleId } = yield* client.request({
        _tag: 'Spawn',
        args: ['-e', 'process.stdin.pipe(process.stdout)'],
        command: process.execPath,
      });
      client.post({ _tag: 'StdinChunk', bytes: new TextEncoder().encode('x').buffer, handleId });
      client.post({ _tag: 'StdinEnd', handleId });
      yield* watched.done;

      assert.strictEqual(stdoutText(watched.seen), 'x');
      assert.strictEqual(exitCode(watched.seen), 0);
    }),
  );

  it.effect('kills a running child', () =>
    Effect.gen(function* () {
      const { client, webview } = yield* fulfillment;
      const watched = watch(webview);

      const { handleId } = yield* client.request({
        _tag: 'Spawn',
        args: ['-e', 'setInterval(() => {}, 1000)'],
        command: process.execPath,
      });
      const result = yield* client.request({ _tag: 'Kill', handleId });
      assert.strictEqual(result._tag, 'KillResult');
      yield* watched.done;
      assert.strictEqual(exitCode(watched.seen), 1);
    }),
  );
});

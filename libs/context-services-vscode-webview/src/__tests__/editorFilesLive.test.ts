import { assert, describe, it } from '@effect/vitest';
import { EditorFiles } from '@lib/context-services';
import { Effect } from 'effect';

import { makeEditorFilesLive } from '../EditorFilesLive.ts';
import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';
import { IpcClient } from '../protocol/ipcClient.ts';

import { connectFakePeers } from '../protocol/fakePeer.testing.ts';

describe('makeEditorFilesLive', () => {
  it.effect('reads text and forwards the window over Host IPC', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      const seen: unknown[] = [];
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'EditorReadTextFile') {
          seen.push({ limit: message.limit, line: message.line, path: message.path });
          extension.postMessage(encodeIpcMessage({ _tag: 'EditorReadTextFileResult', content: 'hi', id: message.id }));
        }
      });
      const files = yield* EditorFiles.pipe(Effect.provide(makeEditorFilesLive(new IpcClient(webview))));
      assert.strictEqual(files.supported, true);
      assert.strictEqual(yield* files.readText('/tmp/a.ts', { limit: 2, line: 3 }), 'hi');
      assert.strictEqual(yield* files.readText('/tmp/a.ts'), 'hi');
      assert.deepStrictEqual(seen, [
        { limit: 2, line: 3, path: '/tmp/a.ts' },
        { limit: undefined, line: undefined, path: '/tmp/a.ts' },
      ]);
    }),
  );

  it.effect('writes text via Host IPC', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      const seen: unknown[] = [];
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'EditorWriteTextFile') {
          seen.push({ content: message.content, path: message.path });
          extension.postMessage(encodeIpcMessage({ _tag: 'EditorWriteTextFileResult', id: message.id }));
        }
      });
      const files = yield* EditorFiles.pipe(Effect.provide(makeEditorFilesLive(new IpcClient(webview))));
      yield* files.writeText('/tmp/a.ts', 'body');
      assert.deepStrictEqual(seen, [{ content: 'body', path: '/tmp/a.ts' }]);
    }),
  );

  it.effect('maps a Host Error to EditorFilesFailed', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'EditorReadTextFile') {
          extension.postMessage(encodeIpcMessage({ _tag: 'Error', id: message.id, message: 'nope' }));
        }
      });
      const files = yield* EditorFiles.pipe(Effect.provide(makeEditorFilesLive(new IpcClient(webview))));
      const error = yield* files.readText('/tmp/a.ts').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'EditorFilesFailed');
    }),
  );
});

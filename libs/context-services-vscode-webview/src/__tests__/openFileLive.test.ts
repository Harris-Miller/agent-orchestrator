import { assert, describe, it } from '@effect/vitest';
import { OpenFile } from '@lib/context-services';
import { Effect } from 'effect';

import { makeOpenFileLive } from '../OpenFileLive.ts';
import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';
import { IpcClient } from '../protocol/ipcClient.ts';

import { connectFakePeers } from './fakePeer.ts';

describe('makeOpenFileLive', () => {
  it.effect('opens file via Host IPC', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'OpenFile') {
          extension.postMessage(encodeIpcMessage({ _tag: 'OpenFileResult', id: message.id }));
        }
      });
      const openFile = yield* OpenFile.pipe(Effect.provide(makeOpenFileLive(new IpcClient(webview))));
      assert.strictEqual(openFile.supported, true);
      yield* openFile.open('/tmp/example.ts');
    }),
  );

  it.effect('fails when response tag is unexpected', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'OpenFile') {
          extension.postMessage(encodeIpcMessage({ _tag: 'AppExitResult', id: message.id }));
        }
      });
      const openFile = yield* OpenFile.pipe(Effect.provide(makeOpenFileLive(new IpcClient(webview))));
      const error = yield* openFile.open('/tmp/example.ts').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'OpenFileFailed');
      assert.match(error.message, /Unexpected OpenFile response/);
    }),
  );

  it.effect('opens image bytes via Host IPC', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      const seen: unknown[] = [];
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'OpenImageData') {
          seen.push({ base64: message.base64, mimeType: message.mimeType });
          extension.postMessage(encodeIpcMessage({ _tag: 'OpenImageDataResult', id: message.id }));
        }
      });
      const openFile = yield* OpenFile.pipe(Effect.provide(makeOpenFileLive(new IpcClient(webview))));
      yield* openFile.openImageData('image/png', 'AAAA');
      assert.deepStrictEqual(seen, [{ base64: 'AAAA', mimeType: 'image/png' }]);
    }),
  );
});

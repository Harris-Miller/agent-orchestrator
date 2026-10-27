import { assert, describe, it } from '@effect/vitest';
import { FileDialog } from '@lib/context-services';
import { Effect } from 'effect';

import { makeFileDialogLive } from '../FileDialogLive.ts';
import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';
import { IpcClient } from '../protocol/ipcClient.ts';

import { connectFakePeers } from './fakePeer.ts';

describe('makeFileDialogLive', () => {
  it.effect('cancel → empty paths', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'FileDialogPickFiles') {
          extension.postMessage(
            encodeIpcMessage({
              _tag: 'FileDialogPickFilesResult',
              id: message.id,
              paths: [],
            }),
          );
        }
      });

      const layer = makeFileDialogLive(new IpcClient(webview));
      const dialog = yield* FileDialog.pipe(Effect.provide(layer));
      const paths = yield* dialog.pickFiles({ multiple: true });
      assert.deepStrictEqual(paths, []);
    }),
  );

  it.effect('returns absolute paths', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'FileDialogPickFiles') {
          extension.postMessage(
            encodeIpcMessage({
              _tag: 'FileDialogPickFilesResult',
              id: message.id,
              paths: ['/tmp/a.png', '/tmp/b.jpg'],
            }),
          );
        }
      });

      const layer = makeFileDialogLive(new IpcClient(webview));
      const dialog = yield* FileDialog.pipe(Effect.provide(layer));
      const paths = yield* dialog.pickFiles({
        filters: [{ extensions: ['png', 'jpg'], name: 'Images' }],
        multiple: true,
      });
      assert.deepStrictEqual(paths, ['/tmp/a.png', '/tmp/b.jpg']);
    }),
  );
});

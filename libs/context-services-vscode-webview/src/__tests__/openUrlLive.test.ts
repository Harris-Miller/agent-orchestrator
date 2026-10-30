import { assert, describe, it } from '@effect/vitest';
import { OpenUrl } from '@lib/context-services';
import { Effect } from 'effect';

import { makeOpenUrlLive } from '../OpenUrlLive.ts';
import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';
import { IpcClient } from '../protocol/ipcClient.ts';

import { connectFakePeers } from './fakePeer.ts';

describe('makeOpenUrlLive', () => {
  it.effect('opens URL via Host IPC', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'OpenUrl') {
          extension.postMessage(encodeIpcMessage({ _tag: 'OpenUrlResult', id: message.id }));
        }
      });

      const layer = makeOpenUrlLive(new IpcClient(webview));
      const openUrl = yield* OpenUrl.pipe(Effect.provide(layer));
      yield* openUrl.open('https://accounts.google.com/o/oauth2');
    }),
  );

  it.effect('fails when response tag is unexpected', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'OpenUrl') {
          extension.postMessage(encodeIpcMessage({ _tag: 'AppExitResult', id: message.id }));
        }
      });

      const layer = makeOpenUrlLive(new IpcClient(webview));
      const openUrl = yield* OpenUrl.pipe(Effect.provide(layer));
      const error = yield* openUrl.open('https://example.com').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'OpenUrlFailed');
      assert.match(error.message, /Unexpected OpenUrl response/);
    }),
  );
});

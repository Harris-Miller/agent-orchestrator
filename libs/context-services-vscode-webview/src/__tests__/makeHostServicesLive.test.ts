import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, FileSystem } from 'effect';

import { makeHostServicesLive } from '../makeHostServicesLive.ts';
import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';

import { connectFakePeers } from './fakePeer.ts';

describe('makeHostServicesLive (fake peer)', () => {
  it.effect('OS snapshot + exists round-trip through IPC', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();

      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'OsSnapshot') {
          extension.postMessage(
            encodeIpcMessage({
              _tag: 'OsSnapshotResult',
              arch: 'x64',
              cwd: '/tmp/ext',
              env: { PATH: '/usr/bin' },
              homedir: '/home/test',
              id: message.id,
              platform: 'linux',
            }),
          );
          return;
        }
        if (message._tag === 'FsExists') {
          extension.postMessage(
            encodeIpcMessage({
              _tag: 'FsExistsResult',
              exists: message.path === '/home/test/.ao',
              id: message.id,
            }),
          );
        }
      });

      const layer = makeHostServicesLive({ port: webview });
      const os = yield* OS.pipe(Effect.provide(layer));
      assert.strictEqual(os.cwd(), '/tmp/ext');
      assert.strictEqual(os.homedir(), '/home/test');
      assert.strictEqual(os.platform(), 'linux');
      assert.strictEqual(os.env().PATH, '/usr/bin');

      const fs = yield* FileSystem.FileSystem.pipe(Effect.provide(layer));
      assert.strictEqual(yield* fs.exists('/home/test/.ao'), true);
      assert.strictEqual(yield* fs.exists('/missing'), false);
    }),
  );
});

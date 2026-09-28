import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';
import type { IpcMessage } from '../protocol/index.ts';

import { connectFakePeers } from './fakePeer.ts';

describe('extension↔webview IPC protocol (fake peer)', () => {
  it.effect('round-trips OsSnapshot request and result over duplex ports', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();

      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        assert.strictEqual(message._tag, 'OsSnapshot');
        if (message._tag !== 'OsSnapshot') {
          return;
        }
        extension.postMessage(
          encodeIpcMessage({
            _tag: 'OsSnapshotResult',
            cwd: '/ext/cwd',
            env: { PATH: '/bin' },
            homedir: '/home/ao',
            id: message.id,
            platform: 'darwin',
          }),
        );
      });

      const id = 'corr-1';
      const message = yield* Effect.callback<IpcMessage>(resume => {
        const dispose = webview.onMessage(raw => {
          dispose();
          resume(Effect.succeed(decodeIpcMessage(raw)));
        });
        webview.postMessage(encodeIpcMessage({ _tag: 'OsSnapshot', id }));
      });

      assert.deepStrictEqual(message, {
        _tag: 'OsSnapshotResult',
        cwd: '/ext/cwd',
        env: { PATH: '/bin' },
        homedir: '/home/ao',
        id,
        platform: 'darwin',
      });
    }),
  );

  it.effect('forwards transferable stdout chunk ArrayBuffer', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      const bytes = new TextEncoder().encode('hello');
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

      const received = yield* Effect.callback<{
        message: IpcMessage;
        transfer?: readonly ArrayBuffer[];
      }>(resume => {
        const dispose = webview.onMessage((raw, transfer) => {
          dispose();
          resume(Effect.succeed({ message: decodeIpcMessage(raw), transfer }));
        });
        extension.postMessage(encodeIpcMessage({ _tag: 'StdoutChunk', bytes: buffer, handleId: 'h1' }), [buffer]);
      });

      assert.strictEqual(received.message._tag, 'StdoutChunk');
      assert.ok(received.transfer);
      assert.strictEqual(received.transfer.length, 1);
      if (received.message._tag === 'StdoutChunk') {
        assert.deepStrictEqual(new Uint8Array(received.message.bytes as ArrayBuffer), bytes);
      }
    }),
  );

  it.effect('supports dual-agent concurrent control round-trips', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();

      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        assert.strictEqual(message._tag, 'Spawn');
        if (message._tag !== 'Spawn') {
          return;
        }
        extension.postMessage(
          encodeIpcMessage({
            _tag: 'SpawnResult',
            handleId: `handle-${message.id}`,
            id: message.id,
            pid: message.id === 'a' ? 101 : 202,
          }),
        );
      });

      const collected = yield* Effect.callback<{ message: IpcMessage }[]>(resume => {
        const results: { message: IpcMessage }[] = [];
        const dispose = webview.onMessage(raw => {
          results.push({ message: decodeIpcMessage(raw) });
          if (results.length === 2) {
            dispose();
            resume(Effect.succeed(results));
          }
        });
        webview.postMessage(encodeIpcMessage({ _tag: 'Spawn', args: [], command: 'node', id: 'a' }));
        webview.postMessage(encodeIpcMessage({ _tag: 'Spawn', args: [], command: 'node', id: 'b' }));
      });

      const byId = new Map(
        collected.map(r => [r.message._tag === 'SpawnResult' ? r.message.id : '', r.message] as const),
      );
      assert.strictEqual(byId.get('a')?._tag, 'SpawnResult');
      assert.strictEqual(byId.get('b')?._tag, 'SpawnResult');
      const resultA = byId.get('a');
      const resultB = byId.get('b');
      assert.ok(resultA?._tag === 'SpawnResult');
      assert.ok(resultB?._tag === 'SpawnResult');
      assert.strictEqual(resultA.pid, 101);
      assert.strictEqual(resultB.pid, 202);
    }),
  );
});

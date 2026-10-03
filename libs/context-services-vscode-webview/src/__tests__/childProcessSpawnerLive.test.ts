import { assert, describe, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { makeChildProcessSpawnerLive } from '../ChildProcessSpawnerLive.ts';
import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';
import { IpcClient } from '../protocol/ipcClient.ts';

import { connectFakePeers } from './fakePeer.ts';

describe('makeChildProcessSpawnerLive', () => {
  it.effect('stdout Stream.runCollect completes after StdoutEnd + Exit', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();

      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag !== 'Spawn') {
          return;
        }
        const handleId = 'h1';
        extension.postMessage(
          encodeIpcMessage({
            _tag: 'SpawnResult',
            handleId,
            id: message.id,
            pid: 42,
          }),
        );
        // Defer stream lifecycle until after spawn registers process listeners.
        queueMicrotask(() => {
          const bytes = new TextEncoder().encode('a\0b\0').buffer;
          extension.postMessage(encodeIpcMessage({ _tag: 'StdoutChunk', bytes, handleId }), [bytes]);
          extension.postMessage(encodeIpcMessage({ _tag: 'StdoutEnd', handleId }));
          extension.postMessage(encodeIpcMessage({ _tag: 'Exit', code: 0, handleId }));
        });
      });

      const client = yield* Effect.sync(() => new IpcClient(webview));
      const layer = makeChildProcessSpawnerLive(client);
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner.pipe(Effect.provide(layer));

      const listed = yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(ChildProcess.make('fd', ['-0'], { cwd: '/tmp' }));
          const [chunks, exitCode] = yield* Effect.all(
            [handle.stdout.pipe(Stream.decodeText(), Stream.runCollect), handle.exitCode],
            { concurrency: 2 },
          );
          return { exitCode, stdout: [...chunks].join('') } as const;
        }),
      );

      assert.strictEqual(listed.exitCode, 0);
      assert.strictEqual(listed.stdout, 'a\0b\0');
    }),
  );
});

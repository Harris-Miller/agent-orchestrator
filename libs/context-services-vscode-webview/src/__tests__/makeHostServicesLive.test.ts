import { assert, describe, it } from '@effect/vitest';
import { AtomicFile, OS } from '@lib/context-services';
import { Effect, FileSystem } from 'effect';

import { makeHostServicesLive } from '../makeHostServicesLive.ts';
import { decodeIpcMessage, encodeIpcMessage } from '../protocol/index.ts';

import { connectFakePeers } from '../protocol/fakePeer.testing.ts';

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

  it.effect('atomic replace, binary writeFile and copyFile round-trip through IPC', () =>
    Effect.gen(function* () {
      const [webview, extension] = connectFakePeers();
      const seen: string[] = [];

      extension.onMessage(raw => {
        const message = decodeIpcMessage(raw);
        if (message._tag === 'OsSnapshot') {
          extension.postMessage(
            encodeIpcMessage({
              _tag: 'OsSnapshotResult',
              arch: 'x64',
              cwd: '/tmp',
              env: {},
              homedir: '/home/test',
              id: message.id,
              platform: 'linux',
            }),
          );
        } else if (message._tag === 'FsAtomicReplaceFileString') {
          seen.push(`atomic:${message.path}:${message.content}`);
          extension.postMessage(encodeIpcMessage({ _tag: 'FsAtomicReplaceFileStringResult', id: message.id }));
        } else if (message._tag === 'FsWriteFile') {
          seen.push(`write:${message.path}`);
          extension.postMessage(encodeIpcMessage({ _tag: 'FsWriteFileResult', id: message.id }));
        } else if (message._tag === 'FsCopyFile') {
          seen.push(`copy:${message.fromPath}->${message.toPath}`);
          extension.postMessage(encodeIpcMessage({ _tag: 'FsCopyFileResult', id: message.id }));
        }
      });

      const layer = makeHostServicesLive({ port: webview });
      const atomicFile = yield* AtomicFile.pipe(Effect.provide(layer));
      yield* atomicFile.replaceFileString('/home/test/.ao/providers/x/current.json', '{}');
      const fs = yield* FileSystem.FileSystem.pipe(Effect.provide(layer));
      yield* fs.writeFile('/tmp/bin', new Uint8Array([1, 2, 3]));
      yield* fs.copyFile('/tmp/a', '/tmp/b');
      assert.deepStrictEqual(seen, [
        'atomic:/home/test/.ao/providers/x/current.json:{}',
        'write:/tmp/bin',
        'copy:/tmp/a->/tmp/b',
      ]);
    }),
  );
});

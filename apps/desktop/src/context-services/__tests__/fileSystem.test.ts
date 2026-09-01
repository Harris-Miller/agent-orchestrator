import { assert, describe, layer } from '@effect/vitest';
import {
  exists as tauriExists,
  readFile as tauriReadFile,
  remove as tauriRemove,
  writeFile as tauriWriteFile,
} from '@tauri-apps/plugin-fs';
import { Effect, FileSystem } from 'effect';
import { beforeEach, vi } from 'vitest';

import { FileSystemLive } from '../FileSystemLive.ts';

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
  truncate: vi.fn(),
  writeFile: vi.fn(),
}));

const mockedExists = vi.mocked(tauriExists);
const mockedReadFile = vi.mocked(tauriReadFile);
const mockedRemove = vi.mocked(tauriRemove);
const mockedWriteFile = vi.mocked(tauriWriteFile);

beforeEach(() => {
  mockedExists.mockReset();
  mockedReadFile.mockReset();
  mockedRemove.mockReset();
  mockedWriteFile.mockReset();
});

describe('FileSystemLive', () => {
  layer(FileSystemLive)(it => {
    it.effect('exists is true when access succeeds', () =>
      Effect.gen(function* () {
        mockedExists.mockResolvedValue(true);
        const fs = yield* FileSystem.FileSystem;
        assert.isTrue(yield* fs.exists('/tmp/a'));
        assert.strictEqual(mockedExists.mock.calls[0]?.[0], '/tmp/a');
      }),
    );

    it.effect('exists is false on NotFound', () =>
      Effect.gen(function* () {
        mockedExists.mockResolvedValue(false);
        const fs = yield* FileSystem.FileSystem;
        assert.isFalse(yield* fs.exists('/tmp/missing'));
      }),
    );

    it.effect('readFileString / writeFileString round-trip through plugin-fs', () =>
      Effect.gen(function* () {
        mockedWriteFile.mockResolvedValue(undefined);
        mockedReadFile.mockResolvedValue(new TextEncoder().encode('hello'));
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString('/tmp/x.txt', 'hello');
        const text = yield* fs.readFileString('/tmp/x.txt');
        assert.strictEqual(text, 'hello');
        assert.strictEqual(mockedWriteFile.mock.calls.length, 1);
        assert.strictEqual(mockedReadFile.mock.calls[0]?.[0], '/tmp/x.txt');
      }),
    );

    it.effect('remove with force ignores NotFound', () =>
      Effect.gen(function* () {
        mockedRemove.mockRejectedValue(Object.assign(new Error('ENOENT: not found'), { kind: 'NotFound' }));
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove('/tmp/gone', { force: true });
      }),
    );

    it.effect('unsupported open fails with PlatformError', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const error = yield* Effect.flip(fs.open('/tmp/x'));
        assert.strictEqual(error._tag, 'PlatformError');
        assert.match(error.message, /not supported/i);
      }),
    );
  });
});

import { assert, describe, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';

import { childDirectoryListCommand, parseChildDirectoryLines } from './sessionDirectoryBrowser.ts';

describe('childDirectoryListCommand', () => {
  it('darwin excludes hidden by default', () => {
    assert.deepStrictEqual(childDirectoryListCommand('darwin', { showHidden: false }), {
      args: ['.', '-maxdepth', '1', '-mindepth', '1', '!', '-name', '.*', '-type', 'd'],
      command: 'find',
    });
  });

  it('darwin includes hidden when requested', () => {
    assert.deepStrictEqual(childDirectoryListCommand('darwin', { showHidden: true }), {
      args: ['.', '-maxdepth', '1', '-mindepth', '1', '-type', 'd'],
      command: 'find',
    });
  });

  it('win32 excludes hidden by default', () => {
    assert.deepStrictEqual(childDirectoryListCommand('win32', { showHidden: false }), {
      args: ['/c', 'dir', '/b', '/a:d-h'],
      command: 'cmd',
    });
  });

  it('win32 includes hidden when requested', () => {
    assert.deepStrictEqual(childDirectoryListCommand('win32', { showHidden: true }), {
      args: ['/c', 'dir', '/b', '/a:d'],
      command: 'cmd',
    });
  });

  it('rejects unsupported platforms', () => {
    assert.throws(() => childDirectoryListCommand('freebsd', { showHidden: false }), /Unsupported platform/);
  });
});

describe('parseChildDirectoryLines', () => {
  it.effect('parses find-style paths and drops . / ..', () =>
    Effect.gen(function* () {
      const names = yield* parseChildDirectoryLines(Stream.make('.', '..', './src', './.git', '', './apps'));
      assert.deepStrictEqual(names, ['.git', 'apps', 'src']);
    }),
  );

  it.effect('parses dir bare names', () =>
    Effect.gen(function* () {
      const names = yield* parseChildDirectoryLines(Stream.make('.', '..', 'Documents', 'Downloads'));
      assert.deepStrictEqual(names, ['Documents', 'Downloads']);
    }),
  );

  it.effect('uses basename for nested path fragments', () =>
    Effect.gen(function* () {
      const names = yield* parseChildDirectoryLines(Stream.make('C:\\Users\\harris\\Projects', './nested/dir'));
      assert.deepStrictEqual(names, ['dir', 'Projects']);
    }),
  );
});

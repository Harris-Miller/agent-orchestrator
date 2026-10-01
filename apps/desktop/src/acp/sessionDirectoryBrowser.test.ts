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
  it('parses find-style paths and drops . / ..', () => {
    assert.deepStrictEqual(
      Effect.runSync(parseChildDirectoryLines(Stream.make('.', '..', './src', './.git', '', './apps'))),
      ['.git', 'apps', 'src'],
    );
  });

  it('parses dir bare names', () => {
    assert.deepStrictEqual(Effect.runSync(parseChildDirectoryLines(Stream.make('.', '..', 'Documents', 'Downloads'))), [
      'Documents',
      'Downloads',
    ]);
  });

  it('uses basename for nested path fragments', () => {
    assert.deepStrictEqual(
      Effect.runSync(parseChildDirectoryLines(Stream.make('C:\\Users\\harris\\Projects', './nested/dir'))),
      ['dir', 'Projects'],
    );
  });
});

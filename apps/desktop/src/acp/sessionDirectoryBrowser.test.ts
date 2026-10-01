import { assert, describe, it } from '@effect/vitest';

import { childDirectoryListCommand, parseChildDirectoryStdout } from './sessionDirectoryBrowser.ts';

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

describe('parseChildDirectoryStdout', () => {
  it('parses find-style paths and drops . / ..', () => {
    assert.deepStrictEqual(parseChildDirectoryStdout(['.', '..', './src', './.git', '', './apps'].join('\n')), [
      '.git',
      'apps',
      'src',
    ]);
  });

  it('parses dir bare names with CRLF', () => {
    assert.deepStrictEqual(parseChildDirectoryStdout('.\r\n..\r\nDocuments\r\nDownloads\r\n'), [
      'Documents',
      'Downloads',
    ]);
  });

  it('uses basename for nested path fragments', () => {
    assert.deepStrictEqual(parseChildDirectoryStdout('C:\\Users\\harris\\Projects\n./nested/dir'), ['dir', 'Projects']);
  });
});

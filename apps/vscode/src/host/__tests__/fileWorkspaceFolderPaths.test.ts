import { assert, describe, it } from '@effect/vitest';

import { fileWorkspaceFolderPaths } from '../fileWorkspaceFolderPaths.ts';

describe('fileWorkspaceFolderPaths', () => {
  it('returns empty for null/undefined/empty', () => {
    assert.deepStrictEqual(fileWorkspaceFolderPaths(null), []);
    assert.deepStrictEqual(fileWorkspaceFolderPaths(undefined), []);
    assert.deepStrictEqual(fileWorkspaceFolderPaths([]), []);
  });

  it('keeps file-scheme fsPath order and drops other schemes', () => {
    assert.deepStrictEqual(
      fileWorkspaceFolderPaths([
        { uri: { fsPath: '/a', scheme: 'file' } },
        { uri: { fsPath: '/remote', scheme: 'vscode-remote' } },
        { uri: { fsPath: '/b', scheme: 'file' } },
      ]),
      ['/a', '/b'],
    );
  });

  it('returns empty when only non-file schemes', () => {
    assert.deepStrictEqual(fileWorkspaceFolderPaths([{ uri: { fsPath: '/r', scheme: 'vscode-remote' } }]), []);
  });
});

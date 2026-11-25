import { assert, describe, it } from '@effect/vitest';

import { fileWorkspaceFilePath, fileWorkspaceFolderPaths } from '../fileWorkspaceFolderPaths.ts';

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

describe('fileWorkspaceFilePath', () => {
  it('returns the fsPath of a saved (file-scheme) workspace file', () => {
    assert.strictEqual(fileWorkspaceFilePath({ fsPath: '/w/x.code-workspace', scheme: 'file' }), '/w/x.code-workspace');
  });

  it('omits untitled, remote and missing workspace files', () => {
    assert.isUndefined(fileWorkspaceFilePath({ fsPath: '/untitled', scheme: 'untitled' }));
    assert.isUndefined(fileWorkspaceFilePath({ fsPath: '/r/x.code-workspace', scheme: 'vscode-remote' }));
    assert.isUndefined(fileWorkspaceFilePath(undefined));
  });
});

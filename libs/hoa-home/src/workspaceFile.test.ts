import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { join, resolve } from 'node:path';
import { beforeEach } from 'vitest';

import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';
import {
  isWorkspaceFilePath,
  parseWorkspaceFolders,
  readWorkspaceFolders,
  WorkspaceFileUnresolvable,
} from './workspaceFile.ts';

const store = new Map<string, MapFsEntry>();
const workspaceFile = resolve('/home/operator/work/app.code-workspace');
const workspaceDir = resolve('/home/operator/work');

describe('isWorkspaceFilePath', () => {
  it('matches the extension case-insensitively and nothing else', () => {
    assert.isTrue(isWorkspaceFilePath('/a/b.code-workspace'));
    assert.isTrue(isWorkspaceFilePath('/a/B.Code-Workspace'));
    assert.isFalse(isWorkspaceFilePath('/a/b.code-workspace/'));
    assert.isFalse(isWorkspaceFilePath('/a/code-workspace'));
    assert.isFalse(isWorkspaceFilePath('/a/b'));
  });
});

describe('parseWorkspaceFolders', () => {
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('reads comments, trailing commas, absolute and relative paths in order', () =>
      Effect.gen(function* () {
        const content = `{
          // the folders
          "folders": [
            { "path": "api" }, /* relative to the file */
            { "path": "${resolve('/elsewhere/web').replaceAll('\\', '\\\\')}", "name": "Web" },
            { "path": "../sibling/" },
          ],
          "settings": {},
        }`;
        const folders = yield* parseWorkspaceFolders(content, workspaceFile);
        assert.deepStrictEqual(folders, [
          join(workspaceDir, 'api'),
          resolve('/elsewhere/web'),
          resolve('/home/operator/sibling'),
        ]);
      }),
    );

    testIt.effect('resolves "." to the workspace file directory', () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(yield* parseWorkspaceFolders('{"folders":[{"path":"."}]}', workspaceFile), [
          workspaceDir,
        ]);
      }),
    );

    testIt.effect('keeps file: uris, skips other schemes, and de-duplicates', () =>
      Effect.gen(function* () {
        const content = JSON.stringify({
          folders: [
            { uri: 'file:///home/operator/my%20app' },
            { uri: 'vscode-remote://ssh-remote+box/srv/app' },
            { uri: 'vscode-vfs://github/o/r' },
            { path: '/home/operator/my app' },
            { path: 'api' },
            { path: './api' },
          ],
        });
        assert.deepStrictEqual(yield* parseWorkspaceFolders(content, workspaceFile), [
          '/home/operator/my app',
          join(workspaceDir, 'api'),
        ]);
      }),
    );

    testIt.effect('reads a file: uri with a Windows drive as a drive path', () =>
      Effect.gen(function* () {
        const folders = yield* parseWorkspaceFolders(
          JSON.stringify({ folders: [{ uri: 'file:///c%3A/Users/me/app' }] }),
          workspaceFile,
        );
        assert.deepStrictEqual(folders, ['c:/Users/me/app']);
      }),
    );

    testIt.effect('fails with no-folders when nothing usable remains', () =>
      Effect.gen(function* () {
        for (const content of [
          '{}',
          '{"folders":[]}',
          '{"folders":[{"uri":"vscode-remote://x/y"}]}',
          '{"folders":[{"name":"x"},"nope",3]}',
        ]) {
          const error = yield* Effect.flip(parseWorkspaceFolders(content, workspaceFile));
          assert.instanceOf(error, WorkspaceFileUnresolvable);
          assert.strictEqual(error.reason, 'no-folders');
        }
      }),
    );

    testIt.effect('fails with invalid on unparseable content', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseWorkspaceFolders('{"folders": [', workspaceFile));
        assert.strictEqual(error.reason, 'invalid');
        const notObject = yield* Effect.flip(parseWorkspaceFolders('[1]', workspaceFile));
        assert.strictEqual(notObject.reason, 'invalid');
      }),
    );
  });
});

describe('readWorkspaceFolders', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('reads and parses the file', () =>
      Effect.gen(function* () {
        store.set(workspaceFile, { kind: 'file', content: '{"folders":[{"path":"api"}]}' });
        assert.deepStrictEqual(yield* readWorkspaceFolders(workspaceFile), [join(workspaceDir, 'api')]);
      }),
    );

    testIt.effect('a missing file is unreadable', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(readWorkspaceFolders(workspaceFile));
        assert.isTrue(Exit.isFailure(exit));
        const error = yield* Effect.flip(readWorkspaceFolders(workspaceFile));
        assert.strictEqual(error.reason, 'unreadable');
      }),
    );
  });
});

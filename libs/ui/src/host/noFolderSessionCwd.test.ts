import { assert, describe, it } from '@effect/vitest';

import { isNoFolderSessionCwd } from './noFolderSessionCwd.ts';

describe('isNoFolderSessionCwd', () => {
  it('matches Claude scratch under scratch-workspaces with leaf shape', () => {
    assert.isTrue(
      isNoFolderSessionCwd('/Users/me/Library/Application Support/Claude/scratch-workspaces/scratch-2026-03-15-a1b2c3'),
    );
  });

  it('matches Claude leaf with uppercase hex and mixed-case segments', () => {
    assert.isTrue(
      isNoFolderSessionCwd('/Users/me/Library/Application Support/Claude/Scratch-Workspaces/Scratch-2026-03-15-A1B2C3'),
    );
  });

  it('matches Claude Windows-shaped paths with backslashes', () => {
    assert.isTrue(
      isNoFolderSessionCwd(
        'C:\\Users\\me\\AppData\\Local\\Packages\\Claude_abc\\LocalCache\\scratch-workspaces\\scratch-2026-01-01-dead01',
      ),
    );
  });

  it('rejects scratch-workspaces without a matching leaf', () => {
    assert.isFalse(isNoFolderSessionCwd('/tmp/scratch-workspaces/other-dir'));
  });

  it('rejects scratch leaf without scratch-workspaces ancestor', () => {
    assert.isFalse(isNoFolderSessionCwd('/tmp/projects/scratch-2026-03-15-a1b2c3'));
  });

  it('rejects leaf that appears before scratch-workspaces', () => {
    assert.isFalse(isNoFolderSessionCwd('/tmp/scratch-2026-03-15-a1b2c3/scratch-workspaces/other'));
  });

  it('matches Codex Documents/Codex without requiring a local-YYYY-MM-DD child', () => {
    assert.isTrue(isNoFolderSessionCwd('/Users/me/Documents/Codex'));
    assert.isTrue(isNoFolderSessionCwd('/Users/me/Documents/Codex/local-2026-01-01'));
  });

  it('matches Codex Documents/Codex case-insensitively and with backslashes', () => {
    assert.isTrue(isNoFolderSessionCwd('C:\\Users\\me\\documents\\codex\\project'));
  });

  it('rejects Documents without Codex and Codex without Documents', () => {
    assert.isFalse(isNoFolderSessionCwd('/Users/me/Documents/Other'));
    assert.isFalse(isNoFolderSessionCwd('/Users/me/Codex'));
  });

  it('leaves normal project cwds untouched', () => {
    assert.isFalse(isNoFolderSessionCwd('/Users/me/Projects/agent-orchestrator'));
    assert.isFalse(isNoFolderSessionCwd('C:\\Users\\me\\src\\app'));
  });
});

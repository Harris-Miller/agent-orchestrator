import { assert, describe, it } from '@effect/vitest';

import type { UnifiedHistoryEntry } from './acpSessionBootstrap.ts';
import { groupAndSortSessionsForNav } from './groupAndSortSessionsForNav.ts';

describe('groupAndSortSessionsForNav', () => {
  it('merges multi-scratch Claude and Codex into one No Folder group', () => {
    const history: readonly UnifiedHistoryEntry[] = [
      {
        cwd: '/Users/me/Library/Claude/scratch-workspaces/scratch-2026-03-15-a1b2c3',
        launchTarget: 'claude-agent-acp',
        sessionId: 'claude-a',
        updatedAt: '2024-03-01T00:00:00.000Z',
      },
      {
        cwd: '/Users/me/Library/Claude/scratch-workspaces/scratch-2026-04-01-dead01',
        launchTarget: 'claude-agent-acp',
        sessionId: 'claude-b',
        updatedAt: '2024-04-01T00:00:00.000Z',
      },
      {
        cwd: '/Users/me/Documents/Codex/local-2026-01-01',
        launchTarget: 'codex-acp',
        sessionId: 'codex-a',
        updatedAt: '2024-05-01T00:00:00.000Z',
      },
      {
        cwd: '/Users/me/Projects/app',
        launchTarget: 'antigravity-acp',
        sessionId: 'proj',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const groups = groupAndSortSessionsForNav(history);
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0]?.kind, 'cwd');
    if (groups[0]?.kind === 'cwd') {
      assert.strictEqual(groups[0].cwd, '/Users/me/Projects/app');
    }
    assert.strictEqual(groups[1]?.kind, 'noFolder');
    if (groups[1]?.kind !== 'noFolder') {
      return;
    }
    assert.deepStrictEqual(
      groups[1].sessions.map(entry => entry.sessionId),
      ['codex-a', 'claude-b', 'claude-a'],
    );
  });

  it('keeps normal cwd grouping and does not create empty No Folder', () => {
    const history: readonly UnifiedHistoryEntry[] = [
      { cwd: '/new', launchTarget: 'codex-acp', sessionId: 'b', updatedAt: '2024-06-01T00:00:00.000Z' },
      { cwd: '/old', launchTarget: 'antigravity-acp', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' },
    ];

    const groups = groupAndSortSessionsForNav(history);
    assert.deepStrictEqual(
      groups.map(group => (group.kind === 'cwd' ? group.cwd : group.kind)),
      ['/new', '/old'],
    );
  });

  it('does not create a per-leaf accordion for Claude scratch basenames', () => {
    const history: readonly UnifiedHistoryEntry[] = [
      {
        cwd: '/tmp/scratch-workspaces/scratch-2026-03-15-a1b2c3',
        launchTarget: 'claude-agent-acp',
        sessionId: 'a',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        cwd: '/tmp/scratch-workspaces/scratch-2026-03-16-b2c3d4',
        launchTarget: 'claude-agent-acp',
        sessionId: 'b',
        updatedAt: '2024-02-01T00:00:00.000Z',
      },
    ];

    const groups = groupAndSortSessionsForNav(history);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0]?.kind, 'noFolder');
  });

  it('classifies case-insensitive Windows-shaped No Folder paths', () => {
    const history: readonly UnifiedHistoryEntry[] = [
      {
        cwd: 'C:\\Users\\me\\Documents\\Codex',
        launchTarget: 'codex-acp',
        sessionId: 'codex',
        updatedAt: '2024-02-01T00:00:00.000Z',
      },
      {
        cwd: 'C:\\Users\\me\\AppData\\scratch-workspaces\\Scratch-2026-01-01-ABCDEF',
        launchTarget: 'claude-agent-acp',
        sessionId: 'claude',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        cwd: 'C:\\Users\\me\\src\\app',
        launchTarget: 'antigravity-acp',
        sessionId: 'app',
        updatedAt: '2024-03-01T00:00:00.000Z',
      },
    ];

    const groups = groupAndSortSessionsForNav(history);
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0]?.kind, 'cwd');
    assert.strictEqual(groups[1]?.kind, 'noFolder');
    if (groups[1]?.kind === 'noFolder') {
      assert.deepStrictEqual(
        groups[1].sessions.map(entry => entry.sessionId),
        ['codex', 'claude'],
      );
    }
  });

  it('preserves each No Folder entry real cwd', () => {
    const cwd = '/Users/me/Documents/Codex/local-2026-01-01';
    const groups = groupAndSortSessionsForNav([
      { cwd, launchTarget: 'codex-acp', sessionId: 'x', updatedAt: '2024-01-01T00:00:00.000Z' },
    ]);
    assert.strictEqual(groups[0]?.kind, 'noFolder');
    if (groups[0]?.kind === 'noFolder') {
      assert.strictEqual(groups[0].sessions[0]?.cwd, cwd);
    }
  });

  it('adds a row-less cwd group for a tracked cwd with no sessions, sorted among the others', () => {
    const groups = groupAndSortSessionsForNav(
      [{ cwd: '/z/zed', launchTarget: 'codex-acp', sessionId: 'a', updatedAt: '2024-01-01T00:00:00.000Z' }],
      ['/m/mid', '/z/zed'],
    );
    assert.deepStrictEqual(
      groups.map(group => (group.kind === 'cwd' ? [group.cwd, group.sessions.length] : group.kind)),
      [
        ['/m/mid', 0],
        ['/z/zed', 1],
      ],
    );
  });

  it('ignores a tracked No Folder cwd', () => {
    assert.deepStrictEqual(groupAndSortSessionsForNav([], ['/Users/me/Documents/Codex/local-2026-01-01']), []);
  });

  it('sorts cwd groups alphabetically by directory name, No Folder last', () => {
    const at = '2024-01-01T00:00:00.000Z';
    const entry = (cwd: string, sessionId: string): UnifiedHistoryEntry => ({
      cwd,
      launchTarget: 'codex-acp',
      sessionId,
      updatedAt: at,
    });
    const groups = groupAndSortSessionsForNav([
      entry('/a/zebra', '1'),
      entry('/Users/me/Documents/Codex/local-2026-01-01', '2'),
      entry('/z/apple', '3'),
      entry('/b/Apple', '4'),
      entry('/x/app10', '5'),
      entry('/x/app2', '6'),
    ]);
    assert.deepStrictEqual(
      groups.map(group => (group.kind === 'cwd' ? group.cwd : group.kind)),
      ['/x/app2', '/x/app10', '/b/Apple', '/z/apple', '/a/zebra', 'noFolder'],
    );
  });
});

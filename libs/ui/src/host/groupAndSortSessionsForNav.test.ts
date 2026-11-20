import { assert, describe, it } from '@effect/vitest';

import type { UnifiedHistoryEntry } from './acpSessionBootstrap.ts';
import { groupAndSortSessionsForNav } from './groupAndSortSessionsForNav.ts';

const row = (cwd: string, sessionId: string, updatedAt: string): UnifiedHistoryEntry => ({
  cwd,
  launchTarget: 'codex-acp',
  sessionId,
  updatedAt,
});

describe('groupAndSortSessionsForNav', () => {
  it('groups rows by Project cwd, newest first, across launch targets', () => {
    const groups = groupAndSortSessionsForNav(
      [
        row('/p', 'old', '2024-01-01T00:00:00.000Z'),
        { ...row('/p', 'new', '2024-06-01T00:00:00.000Z'), launchTarget: 'claude-agent-acp' },
      ],
      ['/p'],
    );
    assert.deepStrictEqual(
      groups.map(group => group.sessions.map(entry => entry.sessionId)),
      [['new', 'old']],
    );
  });

  it('orders by Last prompt time, falling back to updatedAt', () => {
    const withPrompt = (entry: UnifiedHistoryEntry, lastPromptAt: string): UnifiedHistoryEntry => ({
      ...entry,
      _meta: { jetbrains: { air: { lastPromptAt } } },
    });
    const groups = groupAndSortSessionsForNav(
      [
        withPrompt(row('/p', 'touched-later', '2024-09-01T00:00:00.000Z'), '2024-01-01T00:00:00.000Z'),
        withPrompt(row('/p', 'prompted-later', '2024-02-01T00:00:00.000Z'), '2024-05-01T00:00:00.000Z'),
        row('/p', 'no-prompt', '2024-03-01T00:00:00.000Z'),
      ],
      ['/p'],
    );
    assert.deepStrictEqual(
      groups[0].sessions.map(entry => entry.sessionId),
      ['prompted-later', 'no-prompt', 'touched-later'],
    );
  });

  it('keeps a Project with no rows as an empty group', () => {
    assert.deepStrictEqual(groupAndSortSessionsForNav([], ['/p']), [{ cwd: '/p', sessions: [] }]);
  });

  it('drops rows whose cwd is not a Project', () => {
    const groups = groupAndSortSessionsForNav([row('/other', 'a', '2024-01-01T00:00:00.000Z')], ['/p']);
    assert.deepStrictEqual(groups, [{ cwd: '/p', sessions: [] }]);
  });

  it('sorts groups by directory name case-insensitively and numerically, tie-break full cwd', () => {
    const groups = groupAndSortSessionsForNav([], ['/x/app10', '/z/apple', '/b/Apple', '/x/app2', '/a/zebra']);
    assert.deepStrictEqual(
      groups.map(group => group.cwd),
      ['/x/app2', '/x/app10', '/b/Apple', '/z/apple', '/a/zebra'],
    );
  });
});

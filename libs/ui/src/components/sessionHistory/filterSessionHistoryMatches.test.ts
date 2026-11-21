import { assert, describe, it } from '@effect/vitest';

import { sessionsForCwd } from '../../host/acpSessionBootstrap.ts';
import { withArchived } from '../../host/sessionHistoryRow.ts';
import { filterSessionHistoryMatches } from './filterSessionHistoryMatches.ts';

const entry = (sessionId: string, title?: string) => ({
  cwd: '/project',
  launchTarget: 'claude-agent-acp' as const,
  sessionId,
  title,
});

describe('Session History search', () => {
  it('matches titles and fallback titles, returning highlight positions', () => {
    const results = filterSessionHistoryMatches(
      [entry('one', 'Alpha Beta'), entry('two'), entry('three', 'Other')],
      'ab',
    );
    assert.deepStrictEqual(
      results.map(result => result.entry.sessionId),
      ['one'],
    );
    assert.deepStrictEqual(results[0].positions, new Set([0, 6]));
    assert.deepStrictEqual(
      filterSessionHistoryMatches([entry('two')], 'New').map(result => result.entry.sessionId),
      ['two'],
    );
    assert.strictEqual(filterSessionHistoryMatches([entry('project', 'Other')], 'project').length, 0);
  });

  it('uses Fzf smart case and preserves its ranking within archive groups', () => {
    const rows = [
      entry('long', 'alpha beta'),
      withArchived(entry('archived-long', 'Albatross'), true),
      entry('exact', 'AB'),
      withArchived(entry('archived-exact', 'AB'), true),
      entry('prefix', 'abacus'),
    ];
    assert.deepStrictEqual(
      filterSessionHistoryMatches(rows, 'ab').map(result => result.entry.sessionId),
      ['exact', 'prefix', 'long', 'archived-exact', 'archived-long'],
    );
    assert.deepStrictEqual(
      filterSessionHistoryMatches(rows, 'AB').map(result => result.entry.sessionId),
      ['exact', 'archived-exact'],
    );
  });

  it('searches each scoped history entry once, including archived entries', () => {
    const rows = [
      entry('pinned', 'Project'),
      withArchived(entry('archived', 'Project'), true),
      { ...entry('elsewhere', 'Project'), cwd: '/other' },
    ];
    assert.deepStrictEqual(
      filterSessionHistoryMatches(sessionsForCwd(rows, '/project'), 'project').map(result => result.entry.sessionId),
      ['pinned', 'archived'],
    );
  });

  it('puts unarchived matches before archived matches', () => {
    const results = filterSessionHistoryMatches(
      [withArchived(entry('archived', 'abc'), true), entry('open', 'a long b c')],
      'abc',
    );
    assert.deepStrictEqual(
      results.map(result => result.entry.sessionId),
      ['open', 'archived'],
    );
  });
});

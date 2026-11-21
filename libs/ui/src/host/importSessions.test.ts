import { assert, describe, it } from '@effect/vitest';

import {
  applyImportPage,
  beginImportPage,
  failImportPage,
  importableRows,
  initialImportState,
  resetImportTargetError,
  targetsWithMorePages,
} from './importSessions.ts';
import { MAX_LIST_PAGES } from './listSessionPages.ts';

const row = (sessionId: string, lastPromptAt?: string) => ({
  cwd: '/w',
  sessionId,
  ...(lastPromptAt === undefined ? {} : { _meta: { jetbrains: { air: { lastPromptAt } } } }),
});

describe('importSessions', () => {
  it('merges pages of every target by (launch target, session id), newest Last prompt time first', () => {
    let state = initialImportState('/w', 1);
    state = applyImportPage(state, 'codex-acp', {
      nextCursor: 'c1',
      sessions: [row('a', '2026-01-01T00:00:00Z'), row('shared', '2026-01-02T00:00:00Z')],
    });
    state = applyImportPage(state, 'claude-agent-acp', {
      sessions: [row('b', '2026-01-03T00:00:00Z'), row('shared', '2026-01-01T12:00:00Z')],
    });
    state = applyImportPage(state, 'codex-acp', { sessions: [row('c', '2026-01-04T00:00:00Z')] });
    assert.deepStrictEqual(
      importableRows(state, []).map(entry => `${entry.launchTarget}:${entry.sessionId}`),
      ['codex-acp:c', 'claude-agent-acp:b', 'codex-acp:shared', 'claude-agent-acp:shared', 'codex-acp:a'],
    );
  });

  it('follows each target cursor until it is exhausted', () => {
    let state = initialImportState('/w', 1);
    assert.includeMembers([...targetsWithMorePages(state)], ['codex-acp', 'claude-agent-acp']);
    state = beginImportPage(state, 'codex-acp');
    assert.notInclude(targetsWithMorePages(state), 'codex-acp');
    state = applyImportPage(state, 'codex-acp', { nextCursor: 'c1', sessions: [] });
    assert.strictEqual(state.targets['codex-acp'].cursor, 'c1');
    assert.include(targetsWithMorePages(state), 'codex-acp');
    state = applyImportPage(state, 'codex-acp', { sessions: [] });
    assert.strictEqual(state.targets['codex-acp'].status, 'done');
    assert.notInclude(targetsWithMorePages(state), 'codex-acp');
  });

  it('a failing target errors alone and retries from where it stopped', () => {
    let state = initialImportState('/w', 1);
    state = applyImportPage(state, 'codex-acp', { nextCursor: 'c1', sessions: [row('a')] });
    state = failImportPage(beginImportPage(state, 'codex-acp'), 'codex-acp', 'boom');
    assert.strictEqual(state.targets['codex-acp'].status, 'error');
    assert.strictEqual(state.targets['claude-agent-acp'].status, 'idle');
    state = resetImportTargetError(state, 'codex-acp');
    assert.strictEqual(state.targets['codex-acp'].status, 'idle');
    assert.strictEqual(state.targets['codex-acp'].cursor, 'c1');
    assert.lengthOf(state.rows, 1);
  });

  it('a repeated cursor or the page cap errors only that target and keeps its rows', () => {
    let state = initialImportState('/w', 1);
    state = applyImportPage(state, 'codex-acp', { nextCursor: 'c1', sessions: [row('a')] });
    state = applyImportPage(state, 'codex-acp', { nextCursor: 'c1', sessions: [row('b')] });
    assert.strictEqual(state.targets['codex-acp'].status, 'error');
    assert.lengthOf(state.rows, 2);
    assert.strictEqual(state.targets['claude-agent-acp'].status, 'idle');

    let capped = initialImportState('/w', 1);
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      capped = applyImportPage(capped, 'codex-acp', { nextCursor: `c${page}`, sessions: [] });
    }
    assert.strictEqual(capped.targets['codex-acp'].status, 'error');
  });

  it('hides rows that are already tracked, archived ones included', () => {
    let state = initialImportState('/w', 1);
    state = applyImportPage(state, 'codex-acp', { sessions: [row('a'), row('b')] });
    const tracked = [
      { ...row('a'), launchTarget: 'codex-acp' as const, _meta: { jetbrains: { air: { archived: true } } } },
    ];
    assert.deepStrictEqual(
      importableRows(state, tracked).map(entry => entry.sessionId),
      ['b'],
    );
  });
});

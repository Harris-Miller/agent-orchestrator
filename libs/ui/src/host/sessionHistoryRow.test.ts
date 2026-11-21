import { assert, describe, it } from '@effect/vitest';

import { decodeHistoryRow, encodeHistoryRow, withArchived, withLastPromptTime } from './sessionHistoryRow.ts';

const wire = {
  _meta: {
    jetbrains: { air: { archived: true, lastPromptAt: '2026-01-01T00:00:00.000Z', model: 'opus', version: 1 } },
    other: { kept: true },
  },
  cwd: '/proj',
  sessionId: 's1',
};

describe('decodeHistoryRow', () => {
  it('lifts the archived flag and Last prompt time out of the AIR meta, keeping the rest', () => {
    assert.deepStrictEqual<unknown>(decodeHistoryRow(wire), {
      _meta: { jetbrains: { air: { model: 'opus', version: 1 } }, other: { kept: true } },
      archived: true,
      cwd: '/proj',
      lastPromptTime: '2026-01-01T00:00:00.000Z',
      sessionId: 's1',
    });
  });

  it('reads a row without AIR meta, or with archived false and a malformed time, as neither', () => {
    assert.deepStrictEqual(decodeHistoryRow({ cwd: '/proj', sessionId: 's1' }), { cwd: '/proj', sessionId: 's1' });
    const decoded = decodeHistoryRow({
      _meta: { jetbrains: { air: { archived: false, lastPromptAt: 3 } } },
      cwd: '/proj',
      sessionId: 's1',
    });
    assert.isUndefined(decoded.archived);
    assert.isUndefined(decoded.lastPromptTime);
  });
});

describe('encodeHistoryRow', () => {
  it('round-trips a decoded row back to its stored AIR encoding', () => {
    assert.deepStrictEqual<unknown>(encodeHistoryRow(decodeHistoryRow(wire)), {
      _meta: {
        jetbrains: { air: { archived: true, lastPromptAt: '2026-01-01T00:00:00.000Z', model: 'opus', version: 1 } },
        other: { kept: true },
      },
      cwd: '/proj',
      sessionId: 's1',
    });
  });

  it('leaves a row with neither field without AIR meta', () => {
    assert.deepStrictEqual(encodeHistoryRow({ cwd: '/proj', sessionId: 's1' }), { cwd: '/proj', sessionId: 's1' });
  });
});

describe('withArchived', () => {
  it('sets and clears the archived flag', () => {
    const row: { cwd: string; sessionId: string; archived?: true } = { cwd: '/proj', sessionId: 's1' };
    const archived = withArchived(row, true);
    assert.strictEqual(archived.archived, true);
    assert.notProperty(withArchived(archived, false), 'archived');
  });
});

describe('withLastPromptTime', () => {
  const row = { cwd: '/proj', lastPromptTime: '2026-01-01T00:00:00.000Z', sessionId: 's1' };

  it('advances a Last prompt time', () => {
    assert.strictEqual(withLastPromptTime(row, '2026-02-01T00:00:00.000Z').lastPromptTime, '2026-02-01T00:00:00.000Z');
  });

  it('never moves it backwards, ignores an unparseable time, and never adds one to a row without', () => {
    assert.strictEqual(withLastPromptTime(row, '2025-01-01T00:00:00.000Z'), row);
    assert.strictEqual(withLastPromptTime(row, 'nope'), row);
    const none = { cwd: '/proj', sessionId: 's1' };
    assert.strictEqual(withLastPromptTime(none, '2026-03-01T00:00:00.000Z'), none);
  });
});

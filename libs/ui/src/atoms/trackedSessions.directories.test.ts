/** A History row's Additional directories and workspace file survive the Tracked session record encoding. */
import { assert, describe, it } from '@effect/vitest';

import { decodeHistoryEntry } from '../host/historyEntry.ts';

import { trackedRecordOf } from './trackedSessions.ts';

describe('trackedRecordOf', () => {
  it('round-trips Additional directories and the workspace file next to the AIR facts', () => {
    const row = decodeHistoryEntry({
      _meta: { jetbrains: { air: { archived: true } } },
      additionalDirectories: ['/lib/a'],
      cwd: '/w',
      sessionId: 's1',
      workspaceFile: '/w/app.code-workspace',
    });

    const record = trackedRecordOf({ ...row, unavailable: true });

    assert.deepStrictEqual(record.additionalDirectories, ['/lib/a']);
    assert.strictEqual(record.workspaceFile, '/w/app.code-workspace');
    assert.deepStrictEqual(decodeHistoryEntry(record), row);
  });

  it('leaves a row without them as it was', () => {
    const record = trackedRecordOf({ cwd: '/w', sessionId: 's1' });
    assert.isFalse('additionalDirectories' in record);
    assert.isFalse('workspaceFile' in record);
  });
});

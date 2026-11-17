import { assert, describe, it } from '@effect/vitest';

import { buildSubagentReport } from './subagentReport.ts';

describe('buildSubagentReport', () => {
  const base = { description: 'Review diff', id: 'c1', task: 'Review the diff' };

  it('names the child and its task and carries the final message', () => {
    assert.strictEqual(
      buildSubagentReport({ ...base, outcome: { status: 'completed', text: 'All good.' } }),
      '<subagent-report id="c1" status="completed">\nsubagent: Review diff\ntask: Review the diff\n\nAll good.\n</subagent-report>',
    );
  });

  it('carries a failure or cancellation as its status and text', () => {
    assert.include(
      buildSubagentReport({ ...base, outcome: { status: 'failed', text: 'connection lost' } }),
      'status="failed">\nsubagent: Review diff\ntask: Review the diff\n\nconnection lost',
    );
    assert.include(buildSubagentReport({ ...base, outcome: { status: 'cancelled', text: 'x' } }), 'status="cancelled"');
  });

  it('reports a completed turn with no message as a failure', () => {
    const report = buildSubagentReport({ ...base, outcome: { status: 'completed', text: ' ' } });
    assert.include(report, 'status="failed"');
    assert.include(report, 'without producing a final message');
  });

  it('cuts a very long task', () => {
    const report = buildSubagentReport({
      ...base,
      outcome: { status: 'completed', text: 'ok' },
      task: 'x'.repeat(5000),
    });
    assert.isBelow(report.length, 1300);
    assert.include(report, '…');
  });
});

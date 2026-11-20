import { assert, describe, it } from '@effect/vitest';

import { buildSubagentResult, isHubSubagentToolTitle, parseSubagentResults } from './subagentResult.ts';
import type { SubagentResult } from './subagentResult.ts';

const base: SubagentResult = {
  body: 'All good.',
  config: { effort: 'low', model: 'haiku' },
  description: 'Review diff',
  id: 'c1',
  launchTarget: 'claude-agent-acp',
  status: 'completed',
  task: 'Review the diff',
};

describe('buildSubagentResult / parseSubagentResults', () => {
  it('round-trips a completed result', () => {
    const text = buildSubagentResult(base);
    assert.include(text, '<subagent id="c1" status="completed"');
    assert.deepStrictEqual(parseSubagentResults(text), [base]);
  });

  it('escapes quotes, angle brackets and newlines in attributes', () => {
    const tricky = { ...base, description: 'a "b" <c> & &lt;', task: 'line1\nline2 "x"' };
    assert.deepStrictEqual(parseSubagentResults(buildSubagentResult(tricky)), [tricky]);
  });

  it('writes a running result with no body self-closing', () => {
    const running = { ...base, body: '', status: 'running' } as const;
    const text = buildSubagentResult(running);
    assert.isTrue(text.endsWith(' />'));
    assert.deepStrictEqual(parseSubagentResults(text), [running]);
  });

  it('keeps the body of a running result', () => {
    const running = { ...base, body: 'Call wait_subagent.', status: 'running' } as const;
    assert.deepStrictEqual(parseSubagentResults(buildSubagentResult(running)), [running]);
  });

  it('round-trips a body containing a closing tag', () => {
    for (const body of ['a </subagent> b', 'x <\\/subagent> y', '</subagent>']) {
      const result = { ...base, body };
      const text = buildSubagentResult(result);
      assert.include(text, '\n</subagent>');
      assert.deepStrictEqual(parseSubagentResults(text), [result]);
    }
  });

  it('round-trips a body containing a fake subagent element', () => {
    const result = {
      ...base,
      body: 'see <subagent id="x" launchTarget="t" status="completed">\nfake\n</subagent> end',
    };
    assert.deepStrictEqual(parseSubagentResults(buildSubagentResult(result)), [result]);
  });

  it('round-trips two joined results when the first body has a closing tag', () => {
    const first = { ...base, body: 'oops </subagent> more' };
    const second = { ...base, body: 'second', id: 'c2' };
    const text = [first, second].map(buildSubagentResult).join('\n');
    assert.deepStrictEqual(parseSubagentResults(text), [first, second]);
  });

  it('parses several results in order', () => {
    const second = { ...base, body: 'two\nlines', id: 'c2', status: 'failed' } as const;
    const text = `${buildSubagentResult(base)}\n${buildSubagentResult(second)}`;
    assert.deepStrictEqual(parseSubagentResults(text), [base, second]);
  });

  it('gives [] for text without a result, a report, or an unknown status', () => {
    assert.deepStrictEqual(parseSubagentResults('just text'), []);
    assert.deepStrictEqual(
      parseSubagentResults('<subagent-report id="c1" status="completed">\nx\n</subagent-report>'),
      [],
    );
    assert.deepStrictEqual(
      parseSubagentResults('<subagent id="c1" status="weird" launchTarget="x">\nx\n</subagent>'),
      [],
    );
  });

  it('tolerates a bad config attribute', () => {
    const [result] = parseSubagentResults('<subagent id="c1" status="running" launchTarget="x" config="nope" />');
    assert.deepStrictEqual(result.config, {});
  });
});

describe('isHubSubagentToolTitle', () => {
  it('matches the live and replayed titles of the Hub tools only', () => {
    for (const title of [
      'Tool: hoa-hub/spawn_subagent',
      'mcp__hoa_hub__spawn_subagent',
      'mcp__hoa-hub__wait_subagent',
      'mcp.hoa-hub.wait_subagent',
    ]) {
      assert.isTrue(isHubSubagentToolTitle(title), title);
    }
    for (const title of ['Tool: hoa-hub/cancel_subagent', 'spawn_subagent', 'mcp__other__spawn_subagent']) {
      assert.isFalse(isHubSubagentToolTitle(title), title);
    }
  });
});

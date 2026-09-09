import { assert, describe, it } from '@effect/vitest';

import { chatItemsFromAccumulator, emptyChatAccumulator, reduceSessionUpdate } from './sessionUpdateReducer.ts';

describe('reduceSessionUpdate', () => {
  it('ignores session_info_update (no chat item)', () => {
    const next = reduceSessionUpdate(emptyChatAccumulator(), {
      sessionUpdate: 'session_info_update',
      title: 'Implement auth',
      updatedAt: '2026-09-01T00:00:00Z',
    });

    assert.deepStrictEqual(chatItemsFromAccumulator(next), []);
  });

  it('keeps rawInput.command from tool_call and content from tool_call_update', () => {
    const afterCall = reduceSessionUpdate(emptyChatAccumulator(), {
      kind: 'execute',
      rawInput: { command: 'gh pr view 11 --json title' },
      sessionUpdate: 'tool_call',
      status: 'pending',
      title: 'Get PR metadata',
      toolCallId: 'call_001',
    });

    const afterUpdate = reduceSessionUpdate(afterCall, {
      content: [{ content: { text: '{"title":"hello"}', type: 'text' }, type: 'content' }],
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'call_001',
    });

    assert.deepStrictEqual(chatItemsFromAccumulator(afterUpdate), [
      {
        command: 'gh pr view 11 --json title',
        id: 'call_001',
        kind: 'tool_call',
        resultText: '{"title":"hello"}',
        status: 'completed',
        title: 'Get PR metadata',
        toolCallId: 'call_001',
        toolKind: 'execute',
      },
    ]);
  });

  it('prefers _meta.claudeCode.toolName over title only when it is Bash', () => {
    const bash = reduceSessionUpdate(emptyChatAccumulator(), {
      _meta: { claudeCode: { toolName: 'Bash' } },
      sessionUpdate: 'tool_call',
      title: 'Get PR #11 metadata and standards files',
      toolCallId: 'call_002',
    });

    assert.deepStrictEqual(chatItemsFromAccumulator(bash), [
      {
        command: undefined,
        id: 'call_002',
        kind: 'tool_call',
        resultText: undefined,
        status: 'pending',
        title: 'Bash',
        toolCallId: 'call_002',
        toolKind: undefined,
      },
    ]);

    const other = reduceSessionUpdate(emptyChatAccumulator(), {
      _meta: { claudeCode: { toolName: 'Read' } },
      sessionUpdate: 'tool_call',
      title: 'Reading configuration file',
      toolCallId: 'call_003',
    });

    assert.deepStrictEqual(chatItemsFromAccumulator(other), [
      {
        command: undefined,
        id: 'call_003',
        kind: 'tool_call',
        resultText: undefined,
        status: 'pending',
        title: 'Reading configuration file',
        toolCallId: 'call_003',
        toolKind: undefined,
      },
    ]);
  });
});

import { assert, describe, it } from '@effect/vitest';

import {
  emptySessionTranscript,
  markNonFinishedToolCallsCancelled,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';

describe('reduceSessionUpdate', () => {
  it('ignores session_info_update (no chat item)', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      sessionUpdate: 'session_info_update',
      title: 'Implement auth',
      updatedAt: '2026-09-01T00:00:00Z',
    });

    assert.deepStrictEqual(next.items, []);
  });

  it('keeps rawInput.command from tool_call and content from tool_call_update', () => {
    const afterCall = reduceSessionUpdate(emptySessionTranscript(), {
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

    assert.deepStrictEqual(afterUpdate.items, [
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
    const bash = reduceSessionUpdate(emptySessionTranscript(), {
      _meta: { claudeCode: { toolName: 'Bash' } },
      sessionUpdate: 'tool_call',
      title: 'Get PR #11 metadata and standards files',
      toolCallId: 'call_002',
    });

    assert.deepStrictEqual(bash.items, [
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

    const other = reduceSessionUpdate(emptySessionTranscript(), {
      _meta: { claudeCode: { toolName: 'Read' } },
      sessionUpdate: 'tool_call',
      title: 'Reading configuration file',
      toolCallId: 'call_003',
    });

    assert.deepStrictEqual(other.items, [
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

describe('markNonFinishedToolCallsCancelled', () => {
  it('marks pending and in_progress tool calls cancelled; leaves completed and failed', () => {
    let transcript = emptySessionTranscript();
    transcript = reduceSessionUpdate(transcript, {
      sessionUpdate: 'tool_call',
      status: 'pending',
      title: 'A',
      toolCallId: 'a',
    });
    transcript = reduceSessionUpdate(transcript, {
      sessionUpdate: 'tool_call',
      status: 'in_progress',
      title: 'B',
      toolCallId: 'b',
    });
    transcript = reduceSessionUpdate(transcript, {
      sessionUpdate: 'tool_call',
      status: 'completed',
      title: 'C',
      toolCallId: 'c',
    });
    transcript = reduceSessionUpdate(transcript, {
      sessionUpdate: 'tool_call',
      status: 'failed',
      title: 'D',
      toolCallId: 'd',
    });

    const next = markNonFinishedToolCallsCancelled(transcript);
    assert.strictEqual(
      next.items
        .filter(item => item.kind === 'tool_call')
        .map(item => item.status)
        .join(','),
      'cancelled,cancelled,completed,failed',
    );
  });
});

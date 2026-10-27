import { assert, describe, it } from '@effect/vitest';

import type { ChatItem } from './sessionUpdateReducer.ts';
import {
  emptySessionTranscript,
  markNonFinishedToolCallsCancelled,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';

const expectUserMessage = (item: ChatItem | undefined) => {
  assert.ok(item !== undefined);
  assert.strictEqual(item.kind, 'user_message');
  return item as Extract<ChatItem, { readonly kind: 'user_message' }>;
};

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

describe('user_message_chunk image resource_link', () => {
  it('ingests image-like resource_link into user_message images', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: [
        { text: 'see this', type: 'text' },
        {
          mimeType: 'image/png',
          name: 'shot.png',
          type: 'resource_link',
          uri: 'file:///tmp/shot.png',
        },
      ],
      sessionUpdate: 'user_message_chunk',
    });

    assert.strictEqual(next.items.length, 1);
    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, 'see this');
    assert.deepStrictEqual(item.images, [{ mimeType: 'image/png', name: 'shot.png', uri: 'file:///tmp/shot.png' }]);
  });

  it('keeps image-only chunk (no text)', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: {
        name: 'a.png',
        type: 'resource_link',
        uri: 'file:///tmp/a.png',
      },
      sessionUpdate: 'user_message_chunk',
    });

    assert.strictEqual(next.items.length, 1);
    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, '');
    assert.deepStrictEqual(item.images, [{ mimeType: 'image/png', name: 'a.png', uri: 'file:///tmp/a.png' }]);
  });

  it('ignores non-image resource_link', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: [
        { text: 'hi', type: 'text' },
        { name: 'a.txt', type: 'resource_link', uri: 'file:///tmp/a.txt' },
      ],
      sessionUpdate: 'user_message_chunk',
    });

    assert.strictEqual(next.items.length, 1);
    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, 'hi');
    assert.strictEqual(item.images, undefined);
  });

  it('merges image-only follow-up onto trailing user_message', () => {
    let transcript = reduceSessionUpdate(emptySessionTranscript(), {
      content: { text: 'caption', type: 'text' },
      sessionUpdate: 'user_message_chunk',
    });
    transcript = reduceSessionUpdate(transcript, {
      content: {
        name: 'b.webp',
        type: 'resource_link',
        uri: 'file:///tmp/b.webp',
      },
      sessionUpdate: 'user_message_chunk',
    });

    assert.strictEqual(transcript.items.length, 1);
    const item = expectUserMessage(transcript.items[0]);
    assert.strictEqual(item.text, 'caption');
    assert.deepStrictEqual(item.images, [{ mimeType: 'image/webp', name: 'b.webp', uri: 'file:///tmp/b.webp' }]);
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

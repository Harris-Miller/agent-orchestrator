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

  it('coalesces consecutive agent_thought_chunk updates into one agent_thought', () => {
    let transcript = reduceSessionUpdate(emptySessionTranscript(), {
      content: { text: 'Hmm, ', type: 'text' },
      sessionUpdate: 'agent_thought_chunk',
    });
    transcript = reduceSessionUpdate(transcript, {
      content: { text: 'maybe files.', type: 'text' },
      sessionUpdate: 'agent_thought_chunk',
    });

    assert.strictEqual(transcript.items.length, 1);
    assert.deepStrictEqual(transcript.items[0], {
      id: transcript.items[0]?.id,
      kind: 'agent_thought',
      text: 'Hmm, maybe files.',
    });
  });

  it('keeps agent_thought separate from following agent_message', () => {
    let transcript = reduceSessionUpdate(emptySessionTranscript(), {
      content: { text: 'thinking', type: 'text' },
      sessionUpdate: 'agent_thought_chunk',
    });
    transcript = reduceSessionUpdate(transcript, {
      content: { text: 'answer', type: 'text' },
      sessionUpdate: 'agent_message_chunk',
    });

    assert.strictEqual(transcript.items.length, 2);
    assert.strictEqual(transcript.items[0]?.kind, 'agent_thought');
    assert.strictEqual(transcript.items[1]?.kind, 'agent_message');
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

describe('user_message_chunk type image ContentBlock', () => {
  it('ingests type image into user_message with previewDataUrl', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: {
        data: '/9j/4AAQ',
        mimeType: 'image/jpeg',
        type: 'image',
        uri: 'file:///tmp/couch.jpg',
      },
      sessionUpdate: 'user_message_chunk',
    });

    assert.strictEqual(next.items.length, 1);
    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, '');
    assert.deepStrictEqual(item.images, [
      {
        mimeType: 'image/jpeg',
        name: 'couch.jpg',
        previewDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
        uri: 'file:///tmp/couch.jpg',
      },
    ]);
  });

  it('ingests type image alongside text in content array', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: [
        { text: 'see this', type: 'text' },
        { data: 'iVBORw0KGgo=', mimeType: 'image/png', type: 'image' },
      ],
      sessionUpdate: 'user_message_chunk',
    });

    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, 'see this');
    assert.deepStrictEqual(item.images, [
      {
        mimeType: 'image/png',
        previewDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);
  });
});

describe('user_message_chunk image file:// markdown (session/load rewrite)', () => {
  it('lifts image-only text markdown into images and clears text', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: {
        text: '[@bad_couch.png](file:///Users/harris/Pictures/bad_couch.png)',
        type: 'text',
      },
      messageId: 'msg-1',
      sessionUpdate: 'user_message_chunk',
    });

    assert.strictEqual(next.items.length, 1);
    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, '');
    assert.deepStrictEqual(item.images, [
      { mimeType: 'image/png', name: 'bad_couch.png', uri: 'file:///Users/harris/Pictures/bad_couch.png' },
    ]);
  });

  it('lifts image markdown and keeps surrounding text + non-image file links', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: {
        text: 'see [@shot.png](file:///tmp/shot.png) and [@notes.md](file:///tmp/notes.md)',
        type: 'text',
      },
      sessionUpdate: 'user_message_chunk',
    });

    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, 'see and [@notes.md](file:///tmp/notes.md)');
    assert.deepStrictEqual(item.images, [{ mimeType: 'image/png', name: 'shot.png', uri: 'file:///tmp/shot.png' }]);
  });

  it('lifts data:image markdown into images with previewDataUrl', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: {
        text: `[@media image](${dataUrl})`,
        type: 'text',
      },
      messageId: 'msg-data',
      sessionUpdate: 'user_message_chunk',
    });

    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, '');
    assert.deepStrictEqual(item.images, [
      { mimeType: 'image/png', name: 'media image', previewDataUrl: dataUrl, uri: dataUrl },
    ]);
  });

  it('ignores non-image data: markdown links', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), {
      content: {
        text: 'keep [doc](data:text/plain;base64,YQ==) please',
        type: 'text',
      },
      sessionUpdate: 'user_message_chunk',
    });

    const item = expectUserMessage(next.items[0]);
    assert.strictEqual(item.text, 'keep [doc](data:text/plain;base64,YQ==) please');
    assert.strictEqual(item.images, undefined);
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

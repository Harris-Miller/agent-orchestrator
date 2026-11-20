import { assert, describe, it } from '@effect/vitest';

import type { ChatItem } from './sessionUpdateReducer.ts';
import {
  appendUserChatMessage,
  emptySessionTranscript,
  lastAgentMessage,
  markNonFinishedToolCallsCancelled,
  reduceSessionUpdate,
  stampUserMessageTiming,
} from './sessionUpdateReducer.ts';

const expectUserMessage = (item: ChatItem | undefined) => {
  assert.ok(item !== undefined);
  assert.strictEqual(item.kind, 'user_message');
  return item as Extract<ChatItem, { readonly kind: 'user_message' }>;
};

const failureUpdate = (body: object) => ({
  _meta: {
    jetbrains: {
      air: {
        sessionFailure: {
          actions: ['retry'],
          category: 'connection',
          id: 'f1',
          revision: 1,
          severity: 'warning',
          title: 'T',
          ...body,
        },
      },
    },
  },
  sessionUpdate: 'session_info_update',
});

describe('session failure rows', () => {
  it('appends a row for a first failure', () => {
    const next = reduceSessionUpdate(emptySessionTranscript(), failureUpdate({ reason: 'attempt 1 of 3' }));
    assert.deepStrictEqual(next.items, [
      {
        actions: ['retry'],
        category: 'connection',
        id: 'f1',
        kind: 'session_failure',
        reason: 'attempt 1 of 3',
        revision: 1,
        severity: 'warning',
        title: 'T',
      },
    ]);
  });

  it('replaces in place on a higher revision, keeps position', () => {
    let t = reduceSessionUpdate(emptySessionTranscript(), failureUpdate({ reason: 'attempt 1 of 3' }));
    t = appendUserChatMessage(t, 'hi');
    t = reduceSessionUpdate(t, failureUpdate({ reason: 'attempt 2 of 3', revision: 2 }));
    assert.strictEqual(t.items.length, 2);
    const [row] = t.items;
    assert.ok(row?.kind === 'session_failure');
    assert.strictEqual(row.reason, 'attempt 2 of 3');
  });

  it('ignores equal and lower revisions', () => {
    const t = reduceSessionUpdate(emptySessionTranscript(), failureUpdate({ revision: 3, title: 'new' }));
    assert.strictEqual(reduceSessionUpdate(t, failureUpdate({ revision: 3, title: 'x' })), t);
    assert.strictEqual(reduceSessionUpdate(t, failureUpdate({ revision: 2, title: 'x' })), t);
  });

  it('keeps distinct ids as distinct rows', () => {
    let t = reduceSessionUpdate(emptySessionTranscript(), failureUpdate({}));
    t = reduceSessionUpdate(t, failureUpdate({ id: 'f2' }));
    assert.strictEqual(t.items.length, 2);
  });

  it('drops unknown actions, dedupes, and maps unknown severity to warning', () => {
    const t = reduceSessionUpdate(
      emptySessionTranscript(),
      failureUpdate({ actions: ['login', 'teleport', 'login', 'retry'], severity: 'doom' }),
    );
    const [row] = t.items;
    assert.ok(row?.kind === 'session_failure');
    assert.deepStrictEqual(row.actions, ['login', 'retry']);
    assert.strictEqual(row.severity, 'warning');
  });
});

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
        locationPath: undefined,
        resultText: '{"title":"hello"}',
        status: 'completed',
        title: 'Get PR metadata',
        toolCallId: 'call_001',
        toolKind: 'execute',
      },
    ]);
  });

  it('captures locationPath from {path} and bare-string locations, keeping it across updates', () => {
    const first = reduceSessionUpdate(emptySessionTranscript(), {
      locations: [{ path: '/a/b.ts' }],
      sessionUpdate: 'tool_call',
      title: 'Read /a/b.ts',
      toolCallId: 'c1',
    });
    const bare = reduceSessionUpdate(emptySessionTranscript(), {
      locations: ['/x/y.ts'],
      sessionUpdate: 'tool_call',
      title: "Read file 'y.ts'",
      toolCallId: 'c2',
    });
    const updated = reduceSessionUpdate(first, {
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'c1',
    });

    assert.strictEqual(first.items[0].kind === 'tool_call' && first.items[0].locationPath, '/a/b.ts');
    assert.strictEqual(bare.items[0].kind === 'tool_call' && bare.items[0].locationPath, '/x/y.ts');
    assert.strictEqual(updated.items[0].kind === 'tool_call' && updated.items[0].locationPath, '/a/b.ts');
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

describe('stampUserMessageTiming', () => {
  it('patches only the target user_message', () => {
    const base = emptySessionTranscript();
    const t = {
      ...base,
      items: [
        { id: 'a', kind: 'user_message' as const, text: 'a' },
        { id: 'b', kind: 'user_message' as const, text: 'b' },
      ],
    };
    const out = stampUserMessageTiming(t, 'b', { startedAt: 5 });
    assert.deepStrictEqual(out.items[0], t.items[0]);
    assert.deepStrictEqual(out.items[1], { ...t.items[1], startedAt: 5 });
  });
});

describe('appendUserChatMessage', () => {
  it('appends a user_message as a new item', () => {
    const base = emptySessionTranscript();
    const next = appendUserChatMessage(base, 'hello');
    assert.strictEqual(next.items.length, 1);
    assert.deepStrictEqual(next.items[0], { id: next.items[0]?.id, kind: 'user_message', text: 'hello' });
    assert.notStrictEqual(next, base);
  });

  it('lifts mid-draft image file:// markdown into images (composer @ mention)', () => {
    const next = appendUserChatMessage(
      emptySessionTranscript(),
      'Testing what happens [@laios_portrait.jpeg](file:///tmp/laios_portrait.jpeg) in the middle',
    );
    assert.deepStrictEqual(next.items, [
      {
        id: next.items[0]?.id,
        images: [
          {
            mimeType: 'image/jpeg',
            name: 'laios_portrait.jpeg',
            uri: 'file:///tmp/laios_portrait.jpeg',
          },
        ],
        kind: 'user_message',
        text: 'Testing what happens in the middle',
      },
    ]);
  });
});

describe('reduceSessionUpdate planFilePath', () => {
  const call = (planFilePath: unknown) =>
    reduceSessionUpdate(emptySessionTranscript(), {
      rawInput: { planFilePath },
      sessionUpdate: 'tool_call',
      title: 'Exit plan mode',
      toolCallId: 'p1',
    });
  const planOf = (t: ReturnType<typeof call>) => {
    const [item] = t.items;
    return item.kind === 'tool_call' ? item.planFilePath : undefined;
  };

  it('stores the path from tool_call', () => {
    assert.strictEqual(planOf(call('/plans/a.md')), '/plans/a.md');
  });

  it('takes toolKind from tool_call_update, keeping the one from tool_call when absent', () => {
    const created = reduceSessionUpdate(emptySessionTranscript(), {
      sessionUpdate: 'tool_call',
      title: 'wait',
      toolCallId: 'w',
    });
    const kinded = reduceSessionUpdate(created, { kind: 'other', sessionUpdate: 'tool_call_update', toolCallId: 'w' });
    const done = reduceSessionUpdate(kinded, {
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'w',
    });
    const orphan = reduceSessionUpdate(emptySessionTranscript(), {
      kind: 'other',
      sessionUpdate: 'tool_call_update',
      toolCallId: 'o',
    });

    assert.deepStrictEqual(
      [kinded, done, orphan].map(t => (t.items[0] as Extract<ChatItem, { kind: 'tool_call' }>).toolKind),
      ['other', 'other', 'other'],
    );
  });

  it('stores the path from tool_call_update', () => {
    const t = reduceSessionUpdate(call(undefined), {
      rawInput: { planFilePath: '/plans/b.md' },
      sessionUpdate: 'tool_call_update',
      toolCallId: 'p1',
    });
    assert.strictEqual(planOf(t), '/plans/b.md');
  });

  it('keeps the stored path on pathless and blank updates', () => {
    const base = call('/plans/a.md');
    for (const rawInput of [undefined, { planFilePath: '' }]) {
      const t = reduceSessionUpdate(base, {
        rawInput,
        sessionUpdate: 'tool_call_update',
        status: 'completed',
        toolCallId: 'p1',
      });
      assert.strictEqual(planOf(t), '/plans/a.md');
    }
  });

  it('creates the item from an update with no existing item', () => {
    const t = reduceSessionUpdate(emptySessionTranscript(), {
      rawInput: { planFilePath: '/plans/c.md' },
      sessionUpdate: 'tool_call_update',
      toolCallId: 'p2',
    });
    assert.strictEqual(planOf(t), '/plans/c.md');
  });

  it('ignores relative and non-string paths', () => {
    assert.strictEqual(planOf(call('plans/a.md')), undefined);
    assert.strictEqual(planOf(call(42)), undefined);
  });
});

describe('lastAgentMessage', () => {
  const chunk = (text: string) => ({ content: { text, type: 'text' }, sessionUpdate: 'agent_message_chunk' });
  const tool = { sessionUpdate: 'tool_call', status: 'completed', title: 'Read', toolCallId: 't1' };
  const after = (transcript: ReturnType<typeof emptySessionTranscript>, ...updates: object[]) =>
    updates.reduce<ReturnType<typeof emptySessionTranscript>>(
      (current, update) => reduceSessionUpdate(current, update),
      transcript,
    );

  it('is the last agent message after the last user message, not an earlier one', () => {
    const task = appendUserChatMessage(emptySessionTranscript(), 'task');
    const transcript = after(task, chunk('first'), tool, chunk('final'));
    assert.strictEqual(lastAgentMessage(transcript), 'final');
  });

  it('is undefined when the turn produced no message, even if an earlier turn did', () => {
    const earlier = after(appendUserChatMessage(emptySessionTranscript(), 'one'), chunk('old answer'));
    assert.isUndefined(lastAgentMessage(appendUserChatMessage(earlier, 'two')));
    assert.isUndefined(lastAgentMessage(after(appendUserChatMessage(emptySessionTranscript(), 'x'), chunk('  '))));
  });
});

describe('Hub subagent tool calls (Subagent results)', () => {
  const wrapper = (id: string, status = 'completed') =>
    `<subagent id="${id}" status="${status}" launchTarget="codex-acp" description="d" config="{}" task="t">\nfinal\n</subagent>`;
  const call = (title: string) =>
    reduceSessionUpdate(emptySessionTranscript(), {
      sessionUpdate: 'tool_call',
      status: 'in_progress',
      title,
      toolCallId: 'h1',
    });
  const resultsOf = (transcript: ReturnType<typeof call>) => {
    const [item] = transcript.items;
    return item.kind === 'tool_call' ? item.subagentResults : undefined;
  };

  it('parses the result text from content, with the title taken from the call', () => {
    const done = reduceSessionUpdate(call('Tool: hoa-hub/spawn_subagent'), {
      content: [{ content: { text: wrapper('c1'), type: 'text' }, type: 'content' }],
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'h1',
    });
    assert.deepStrictEqual(
      resultsOf(done)?.map(result => [result.id, result.status, result.body]),
      [['c1', 'completed', 'final']],
    );
  });

  it('reads a Codex replay that carries the result only as rawOutput (string or content blocks)', () => {
    for (const rawOutput of [
      wrapper('c1'),
      [{ text: wrapper('c1'), type: 'input_text' }],
      { content: wrapper('c1') },
    ]) {
      const done = reduceSessionUpdate(call('mcp__hoa_hub__wait_subagent'), {
        rawOutput,
        sessionUpdate: 'tool_call_update',
        status: 'completed',
        toolCallId: 'h1',
      });
      assert.strictEqual(resultsOf(done)?.[0].id, 'c1');
    }
  });

  it('reads serde-tagged, JSON-stringified and plain rawOutput', () => {
    const block = { content: [{ text: wrapper('c1'), type: 'text' }] };
    for (const rawOutput of [
      { Ok: block },
      { Ok: { Ok: block } },
      JSON.stringify({ Ok: block }),
      JSON.stringify(wrapper('c1')),
      wrapper('c1'),
    ]) {
      const done = reduceSessionUpdate(call('mcp__hoa_hub__wait_subagent'), {
        rawOutput,
        sessionUpdate: 'tool_call_update',
        status: 'completed',
        toolCallId: 'h1',
      });
      assert.strictEqual(resultsOf(done)?.[0].id, 'c1');
    }
  });

  describe('live Codex wire rawOutput ({ result: { content }, error })', () => {
    const wire = (text: string) => ({
      error: null,
      result: { _meta: null, content: [{ text, type: 'text' }], structuredContent: null },
    });
    const run = (title: string, text: string) =>
      reduceSessionUpdate(call(title), {
        rawOutput: wire(text),
        sessionUpdate: 'tool_call_update',
        status: 'completed',
        toolCallId: 'h1',
      });

    it('reads a spawn_subagent result', () => {
      assert.strictEqual(resultsOf(run('mcp.hoa-hub.spawn_subagent', wrapper('c1', 'running')))?.[0].id, 'c1');
    });

    it('reads a wait_subagent result', () => {
      assert.strictEqual(resultsOf(run('mcp.hoa-hub.wait_subagent', wrapper('c1')))?.[0].status, 'completed');
    });

    it('keeps the row for list_subagent_targets (plain JSON, no wrapper)', () => {
      assert.isUndefined(resultsOf(run('mcp.hoa-hub.list_subagent_targets', '[{"id":"codex-acp"}]')));
    });
  });

  it('keeps no results for an unknown launch target (the generic row stays)', () => {
    const done = reduceSessionUpdate(call('mcp__hoa_hub__wait_subagent'), {
      rawOutput: wrapper('c1').replace('codex-acp', 'nope'),
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'h1',
    });
    assert.isUndefined(resultsOf(done));
  });

  it('keeps results across a later update without output', () => {
    const done = reduceSessionUpdate(
      reduceSessionUpdate(call('mcp__hoa-hub__spawn_subagent'), {
        rawOutput: wrapper('c1'),
        sessionUpdate: 'tool_call_update',
        toolCallId: 'h1',
      }),
      { sessionUpdate: 'tool_call_update', status: 'completed', toolCallId: 'h1' },
    );
    assert.strictEqual(resultsOf(done)?.[0].id, 'c1');
  });

  it('ignores other tools, and Hub calls whose result has no Subagent result', () => {
    const other = reduceSessionUpdate(call('Run tests'), {
      rawOutput: wrapper('c1'),
      sessionUpdate: 'tool_call_update',
      toolCallId: 'h1',
    });
    assert.isUndefined(resultsOf(other));
    const refused = reduceSessionUpdate(call('mcp__hoa-hub__spawn_subagent'), {
      content: [{ content: { text: 'Unknown launch target "x".', type: 'text' }, type: 'content' }],
      sessionUpdate: 'tool_call_update',
      toolCallId: 'h1',
    });
    assert.isUndefined(resultsOf(refused));
  });
});

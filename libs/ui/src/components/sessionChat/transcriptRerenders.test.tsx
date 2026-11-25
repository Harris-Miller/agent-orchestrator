// @vitest-environment happy-dom
import { assert, it } from '@effect/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Effect } from 'effect';
import { Profiler } from 'react';
import type { ReactNode } from 'react';
import { afterEach, vi } from 'vitest';

import { CODEX } from '../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import type { ChatItem } from '../../host/sessionUpdateReducer.ts';
import { harness, subagent } from '../../host/harnessSnapshot.testing.ts';
import { applyLiveSessionUpdate } from '../../host/harnessStateTransitions.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';
import { renderInSessionChatSurface } from './sessionChatSurface.testing.tsx';

const rowRenders = new Map<string, number>();
vi.mock('./transcript/chatItems/AgentMessageView.tsx', () => ({
  AgentMessageView: ({ text }: { readonly text: string }) => {
    const key = text.slice(0, 3);
    rowRenders.set(key, (rowRenders.get(key) ?? 0) + 1);
    return <li>{text}</li>;
  },
}));

const regionRenders = new Map<string, number>();
vi.mock('./transcript/workRegion/workRegionPhrase.ts', () => ({
  // Called once per WorkRegionView render: counts renders per region id.
  workRegionPhrase: (id: string) => {
    regionRenders.set(id, (regionRenders.get(id) ?? 0) + 1);
    return `phrase-${id}`;
  },
}));
vi.mock('./transcript/chatItems/ToolCallView.tsx', () => ({
  ToolCallView: ({ item }: { readonly item: { readonly title: string } }) => <li>{item.title}</li>,
}));

bindHostRuntime(createHostRuntime(mockHostLayer));
const { SessionChatSurfaceProvider } = await import('./useSessionChatSurface.tsx');
const { ChatTranscript } = await import('./transcript/ChatTranscript.tsx');

afterEach(cleanup);

const SUBAGENTS = 5;
const CHUNKS = 50;
const childIds = Array.from({ length: SUBAGENTS }, (_, i) => `c${String(i)}`);

const commits = new Map<string, number>();
const Counted = ({ children, id }: { readonly children: ReactNode; readonly id: string }) => (
  <Profiler
    id={id}
    onRender={() => {
      commits.set(id, (commits.get(id) ?? 0) + 1);
    }}
  >
    {children}
  </Profiler>
);

it.effect('subagent child chunks do not re-render the ChatTranscript', () =>
  Effect.gen(function* () {
    const { registry } = yield* renderInSessionChatSurface(
      <SessionChatSurfaceProvider onClientError={() => undefined}>
        <Counted id="ChatTranscript">
          <ChatTranscript />
        </Counted>
      </SessionChatSurfaceProvider>,
      {
        session: {
          transcript: {
            // No Subagent rows: Profiler also counts descendant commits, which would mask ChatTranscript's own renders.
            items: [{ id: 'u1', kind: 'user_message', text: 'go' }],
            messageIndices: new Map(),
            toolCallIndices: new Map(),
          },
        },
      },
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        registry.dispose();
      }),
    );
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      subagents: harness(
        [],
        childIds.map(id => subagent(id, 's1', { name: id })),
      ).subagents,
    }));

    const chunk = (i: number) => ({
      content: { text: `w${String(i)} `, type: 'text' },
      sessionUpdate: 'agent_message_chunk',
    });
    const feed = (i: number) => {
      updateHarnessSnapshot(registry, CODEX, current => {
        const routed = applyLiveSessionUpdate(current, childIds[i % SUBAGENTS] ?? 'c0', chunk(i));
        return routed.snapshot;
      });
    };

    // warm-up
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        feed(i);
      });
    }
    commits.clear();
    for (let i = 0; i < CHUNKS; i += 1) {
      act(() => {
        feed(i + 10);
      });
    }

    assert.strictEqual(commits.get('ChatTranscript') ?? 0, 0);

    // Positive control: an own-session update must commit, proving the Profiler is live and 's1' is the selected session.
    act(() => {
      updateHarnessSnapshot(registry, CODEX, current => applyLiveSessionUpdate(current, 's1', chunk(0)).snapshot);
    });
    assert.isAtLeast(commits.get('ChatTranscript') ?? 0, 1);
  }).pipe(Effect.scoped),
);

it.effect('own-session chunks re-render only the last transcript row', () =>
  Effect.gen(function* () {
    const ROWS = 20;
    const items: ChatItem[] = Array.from({ length: ROWS }, (_, i): ChatItem[] => [
      { id: `u${String(i)}`, kind: 'user_message', text: 'go' },
      { id: `m${String(i)}`, kind: 'agent_message', text: `m${String(i).padStart(2, '0')}` },
    ]).flat();
    const { registry } = yield* renderInSessionChatSurface(
      <SessionChatSurfaceProvider onClientError={() => undefined}>
        <ChatTranscript />
      </SessionChatSurfaceProvider>,
      {
        session: {
          transcript: {
            items,
            messageIndices: new Map(Array.from({ length: ROWS }, (_, i) => [`m${String(i)}`, i * 2 + 1] as const)),
            toolCallIndices: new Map(),
          },
        },
      },
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        registry.dispose();
      }),
    );
    rowRenders.clear();
    const last = `m${String(ROWS - 1).padStart(2, '0')}`;
    for (let i = 0; i < CHUNKS; i += 1) {
      act(() => {
        updateHarnessSnapshot(
          registry,
          CODEX,
          current =>
            applyLiveSessionUpdate(current, 's1', {
              content: { text: ' x', type: 'text' },
              sessionUpdate: 'agent_message_chunk',
            }).snapshot,
        );
      });
    }
    assert.strictEqual(rowRenders.get(last) ?? 0, CHUNKS);
    const earlier = [...rowRenders].filter(([key]) => key !== last);
    assert.deepStrictEqual(earlier, []);
  }).pipe(Effect.scoped),
);

it.effect('own-session updates re-render only the live WorkRegionView, and it shows the new content', () =>
  Effect.gen(function* () {
    const REGIONS = 5;
    const items: ChatItem[] = Array.from({ length: REGIONS }, (_, i): ChatItem[] => [
      { id: `u${String(i)}`, kind: 'user_message', text: 'go' },
      {
        id: `t${String(i)}`,
        kind: 'tool_call',
        status: 'completed',
        title: `tool-${String(i)}`,
        toolCallId: `t${String(i)}`,
      },
    ]).flat();
    const lastId = `t${String(REGIONS - 1)}`;
    const { registry } = yield* renderInSessionChatSurface(
      <SessionChatSurfaceProvider onClientError={() => undefined}>
        <ChatTranscript />
      </SessionChatSurfaceProvider>,
      {
        session: {
          transcript: {
            items,
            messageIndices: new Map(),
            toolCallIndices: new Map(Array.from({ length: REGIONS }, (_, i) => [`t${String(i)}`, i * 2 + 1] as const)),
          },
        },
      },
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        registry.dispose();
      }),
    );
    // Open the live region so its items are visible.
    fireEvent.click(screen.getByText(`phrase-${lastId}`));
    assert.isNotNull(screen.queryByText(`tool-${String(REGIONS - 1)}`));

    regionRenders.clear();
    for (let i = 0; i < CHUNKS; i += 1) {
      act(() => {
        updateHarnessSnapshot(
          registry,
          CODEX,
          current =>
            applyLiveSessionUpdate(current, 's1', {
              sessionUpdate: 'tool_call',
              status: 'pending',
              title: `new-${String(i)}`,
              toolCallId: `n${String(i)}`,
            }).snapshot,
        );
      });
    }
    // Stale-UI guard: the live region shows the latest content.
    assert.isNotNull(screen.queryByText(`new-${String(CHUNKS - 1)}`));
    assert.isAtLeast(regionRenders.get(lastId) ?? 0, 1);
    const earlier = [...regionRenders].filter(([key]) => key !== lastId);
    assert.deepStrictEqual(earlier, []);
  }).pipe(Effect.scoped),
);

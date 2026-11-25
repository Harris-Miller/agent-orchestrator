// @vitest-environment happy-dom
import { assert, it } from '@effect/vitest';
import { act, cleanup } from '@testing-library/react';
import { Effect } from 'effect';
import { Profiler } from 'react';
import type { ReactNode } from 'react';
import { afterEach } from 'vitest';

import { CODEX } from '../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { harness, subagent } from '../../host/harnessSnapshot.testing.ts';
import { applyLiveSessionUpdate } from '../../host/harnessStateTransitions.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';
import { renderInSessionChatSurface } from './sessionChatSurface.testing.tsx';

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

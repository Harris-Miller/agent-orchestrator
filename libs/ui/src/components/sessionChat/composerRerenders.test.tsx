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
const { Composer } = await import('./composer/Composer.tsx');
const { SubagentItemView } = await import('./transcript/chatItems/SubagentItemView.tsx');

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

it.effect('subagent child chunks do not re-render the Composer; each row renders only for its own child', () =>
  Effect.gen(function* () {
    const items = childIds.map(id => ({ id: `subagent:${id}`, kind: 'subagent' as const, subagentSessionId: id }));
    const { registry } = yield* renderInSessionChatSurface(
      <SessionChatSurfaceProvider onClientError={() => undefined}>
        {items.map(item => (
          <Counted id="SubagentRow" key={item.id}>
            <SubagentItemView item={item} />
          </Counted>
        ))}
        <Counted id="Composer">
          <Composer />
        </Counted>
      </SessionChatSurfaceProvider>,
      {
        session: {
          transcript: {
            items: [{ id: 'u1', kind: 'user_message', text: 'go' }, ...items],
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
        return routed === undefined ? current : routed.snapshot;
      });
    };

    for (let i = 0; i < 10; i += 1) {
      act(() => {
        feed(i);
      });
    } // warm-up
    commits.clear();
    for (let i = 0; i < CHUNKS; i += 1) {
      act(() => {
        feed(i + 10);
      });
    }

    assert.strictEqual(commits.get('Composer') ?? 0, 0);
    assert.strictEqual(commits.get('SubagentRow'), CHUNKS);
  }).pipe(Effect.scoped),
);

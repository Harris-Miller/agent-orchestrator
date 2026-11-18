// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';

import { CODEX, installFakeAgent, installFakeHub } from '../../../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../hostRuntime.ts';
import { beginMcp } from '../../../host/hubSessions.ts';
import { renderInSessionChatSurface } from '../sessionChatSurface.testing.tsx';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { SessionChatSurfaceProvider } = await import('../useSessionChatSurface.tsx');
const { SessionActionsStrip } = await import('./SessionActionsStrip.tsx');

afterEach(cleanup);

const HANDOFF_ON = { appOrchestratedAgentsEnabled: true } as const;

const gatedSession = {
  cwd: '/proj',
  transcript: {
    items: [{ id: 'u1', kind: 'user_message', startedAt: 1, text: 'hello' }],
    messageIndices: new Map<string, number>(),
    toolCallIndices: new Map<string, number>(),
  },
} as const;

const mount = (
  options: Parameters<typeof renderInSessionChatSurface>[1],
  callbacks: { readonly onRequestHandoff?: () => void } = {},
) =>
  renderInSessionChatSurface(
    <SessionChatSurfaceProvider onClientError={() => undefined}>
      <SessionActionsStrip onRequestHandoff={callbacks.onRequestHandoff ?? (() => undefined)} />
    </SessionChatSurfaceProvider>,
    options,
  );

describe('SessionActionsStrip', () => {
  it.effect('shows a read-only cwd label when the host gives no aboveComposer', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({ session: gatedSession });
      assert.isNotNull(screen.getByText('proj'));
      registry.dispose();
    }),
  );

  it.effect('hides Handoff while Experimental: App Orchestrated Agents is off (the default)', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({ session: gatedSession });
      assert.isNull(screen.queryByRole('button', { name: 'Handoff' }));
      assert.isNotNull(screen.getByRole('button', { name: 'Fork' }));
      registry.dispose();
    }),
  );

  it.effect('disables Handoff and Fork when their gates are false', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({ settings: HANDOFF_ON });
      assert.strictEqual(screen.getByRole('button', { name: 'Handoff' }).hasAttribute('disabled'), true);
      assert.strictEqual(screen.getByRole('button', { name: 'Fork' }).hasAttribute('disabled'), true);
      registry.dispose();
    }),
  );

  it.effect('names why Fork and Handoff are unavailable in their tooltips', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({ settings: HANDOFF_ON });
      assert.isNotNull(screen.getByLabelText('Agent cannot fork sessions'));
      assert.isNotNull(screen.getByLabelText('The hub client has not started.'));
      registry.dispose();
    }),
  );

  it.effect('Handoff calls onRequestHandoff when its gate is open', () =>
    Effect.gen(function* () {
      const onRequestHandoff = vi.fn();
      yield* installFakeHub([]);
      yield* Effect.flatMap(beginMcp(CODEX, true), mcp => mcp.bind('s1'));
      const { registry } = yield* mount({ session: gatedSession, settings: HANDOFF_ON }, { onRequestHandoff });
      fireEvent.click(screen.getByRole('button', { name: 'Handoff' }));
      assert.strictEqual(onRequestHandoff.mock.calls.length, 1);
      registry.dispose();
    }).pipe(Effect.scoped),
  );

  it.effect('Fork asks the agent to fork the session when the agent supports it', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const { registry } = yield* mount({ capabilities: { sessionFork: true }, session: gatedSession });
      const fork = screen.getByRole('button', { name: 'Fork' });
      assert.strictEqual(fork.hasAttribute('disabled'), false);
      fireEvent.click(fork);
      yield* Effect.promise(() =>
        waitFor(() => {
          assert.include(calls, 'fork:s1');
        }),
      );
      registry.dispose();
    }).pipe(Effect.scoped),
  );
});

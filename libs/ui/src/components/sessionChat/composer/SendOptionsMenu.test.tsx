// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';

import { installFakeAgent } from '../../../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../hostRuntime.ts';
import { renderInSessionChatSurface } from '../sessionChatSurface.testing.tsx';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { SessionChatSurfaceProvider } = await import('../useSessionChatSurface.tsx');
const { SendOptionsMenu } = await import('./SendOptionsMenu.tsx');

afterEach(cleanup);

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
  callbacks: { readonly onClientError?: (error: unknown) => void; readonly onRequestHandoff?: () => void } = {},
) =>
  renderInSessionChatSurface(
    <SessionChatSurfaceProvider onClientError={callbacks.onClientError ?? (() => undefined)}>
      <SendOptionsMenu
        onRequestHandoff={callbacks.onRequestHandoff ?? (() => undefined)}
        onSubmitDraft={() => undefined}
      />
    </SessionChatSurfaceProvider>,
    options,
  );

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open send options' }));
};

describe('SendOptionsMenu', () => {
  it.effect('opens with the send-split-menu id and aria wiring', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({});
      const trigger = screen.getByRole('button', { name: 'Open send options' });
      assert.strictEqual(trigger.getAttribute('aria-haspopup'), 'menu');
      assert.strictEqual(trigger.hasAttribute('aria-controls'), false);
      fireEvent.click(trigger);
      assert.strictEqual(trigger.getAttribute('aria-expanded'), 'true');
      assert.strictEqual(trigger.getAttribute('aria-controls'), 'send-split-menu');
      registry.dispose();
    }),
  );

  it.effect('disables Handoff and Fork when their gates are false', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({});
      openMenu();
      assert.strictEqual(screen.getByRole('menuitem', { name: 'Handoff' }).getAttribute('aria-disabled'), 'true');
      assert.strictEqual(screen.getByRole('menuitem', { name: 'Fork' }).getAttribute('aria-disabled'), 'true');
      registry.dispose();
    }),
  );

  it.effect('Handoff calls onRequestHandoff when its gate is open', () =>
    Effect.gen(function* () {
      const onRequestHandoff = vi.fn();
      const { registry } = yield* mount({ session: gatedSession }, { onRequestHandoff });
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Handoff' }));
      assert.strictEqual(onRequestHandoff.mock.calls.length, 1);
      registry.dispose();
    }),
  );

  it.effect('Fork asks the agent to fork the session when the agent supports it', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls);
      const { registry } = yield* mount({ capabilities: { sessionFork: true }, session: gatedSession });
      openMenu();
      const fork = screen.getByRole('menuitem', { name: 'Fork' });
      assert.strictEqual(fork.getAttribute('aria-disabled'), null);
      fireEvent.click(fork);
      yield* Effect.promise(() => waitFor(() => assert.include(calls, 'fork:s1')));
      registry.dispose();
    }).pipe(Effect.scoped),
  );
});

// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { advertise, CODEX, connectFakeAgent, enableProviders } from '../../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { ImportSessionsPanel } = await import('./ImportSessionsPanel.tsx');

afterEach(cleanup);

const listedRow = (sessionId: string, title: string, lastPromptAt: string) => ({
  _meta: { jetbrains: { air: { lastPromptAt } } },
  cwd: '/proj',
  sessionId,
  title,
});

const renderPanel = (onDone: () => void) => {
  const registry = AtomRegistry.make();
  enableProviders(registry, [CODEX]);
  advertise(registry, CODEX, {});
  render(
    <RegistryContext.Provider value={registry}>
      <ImportSessionsPanel cwd="/proj" onClientError={vi.fn()} onDone={onDone} />
    </RegistryContext.Provider>,
  );
  return registry;
};

const connectWithRows = Effect.gen(function* () {
  yield* connectFakeAgent(CODEX, {
    agent: {
      'session/list': () =>
        Effect.succeed({
          sessions: [
            listedRow('a', 'Older chat', '2026-01-01T00:00:00Z'),
            listedRow('b', 'Newer chat', '2026-01-02T00:00:00Z'),
          ],
        }),
      'session/load': () => Effect.succeed({ configOptions: [] }),
    },
  });
});

describe('ImportSessionsPanel', () => {
  it.effect('lists rows newest first, filters by typing, and the back arrow returns', () =>
    Effect.gen(function* () {
      yield* connectWithRows;
      const onDone = vi.fn();
      const registry = renderPanel(onDone);

      yield* Effect.promise(() => waitFor(() => screen.getByRole('button', { name: 'Newer chat' })));
      const titles = screen.getAllByRole('button').map(node => node.getAttribute('aria-label'));
      assert.isBelow(titles.indexOf('Newer chat'), titles.indexOf('Older chat'));

      fireEvent.change(screen.getByLabelText('Search sessions to import'), { target: { value: 'older' } });
      yield* Effect.promise(() =>
        waitFor(() => {
          assert.isNull(screen.queryByRole('button', { name: 'Newer chat' }));
        }),
      );
      assert.isNotNull(screen.queryByRole('button', { name: 'Older chat' }));

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      assert.strictEqual(onDone.mock.calls.length, 1);
      cleanup();
      registry.dispose();
    }).pipe(Effect.scoped),
  );

  it.effect('clicking a row shows confirm; confirming imports it and returns', () =>
    Effect.gen(function* () {
      yield* connectWithRows;
      const onDone = vi.fn();
      const registry = renderPanel(onDone);

      yield* Effect.promise(() => waitFor(() => screen.getByRole('button', { name: 'Newer chat' })));
      assert.isNull(screen.queryByRole('button', { name: 'confirm' }));
      fireEvent.click(screen.getByRole('button', { name: 'Newer chat' }));
      fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

      yield* Effect.promise(() =>
        waitFor(() => {
          assert.strictEqual(onDone.mock.calls.length, 1);
        }),
      );
      cleanup();
      registry.dispose();
    }).pipe(Effect.scoped),
  );
});

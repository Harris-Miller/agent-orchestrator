// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { it } from '@effect/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach, describe, expect, vi } from 'vitest';

import { HarnessCacheGate } from './HarnessCacheGate.tsx';

const hydrate = vi.hoisted(() => vi.fn());

vi.mock('../atoms/harnessHydration.ts', () => ({ hydrateHarnessCaches: hydrate }));
vi.mock('../hostRuntime.ts', () => ({
  hostRuntime: { runPromise: (effect: Effect.Effect<unknown>) => Effect.runPromise(effect) },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  hydrate.mockReset();
});

const deferred = () => {
  let resolve!: (stop: () => void) => void;
  const promise = new Promise<() => void>(r => {
    resolve = r;
  });
  return { promise, resolve };
};

const registry = AtomRegistry.make();

const renderGate = () =>
  render(
    <RegistryContext.Provider value={registry}>
      <HarnessCacheGate>
        <div>child</div>
      </HarnessCacheGate>
    </RegistryContext.Provider>,
  );

describe('HarnessCacheGate', () => {
  it.effect('renders children once hydration resolves', () =>
    Effect.gen(function* () {
      hydrate.mockReturnValue(Effect.succeed(vi.fn()));
      renderGate();
      expect(screen.queryByText('child')).toBeNull();
      yield* Effect.promise(() =>
        waitFor(() => {
          expect(screen.getByText('child')).toBeTruthy();
        }),
      );
    }),
  );

  it.effect('unsubscribes when unmounted before hydration resolves, without a setState warning', () =>
    Effect.gen(function* () {
      const gate = deferred();
      const stop = vi.fn();
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      hydrate.mockReturnValue(Effect.promise(() => gate.promise));
      const view = renderGate();
      view.unmount();
      gate.resolve(stop);
      yield* Effect.promise(() =>
        waitFor(() => {
          expect(stop).toHaveBeenCalledTimes(1);
        }),
      );
      expect(error).not.toHaveBeenCalled();
    }),
  );
});

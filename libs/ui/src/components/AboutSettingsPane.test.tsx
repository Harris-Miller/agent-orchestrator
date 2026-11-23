// @vitest-environment happy-dom
import { OpenUrl } from '@lib/context-services';
import { it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterEach, describe, expect, vi } from 'vitest';

import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { theme } from '../theme/themes.ts';
import { AboutSettingsPane, GITHUB_REPO_URL } from './AboutSettingsPane.tsx';

const open = vi.hoisted(() => vi.fn());
const runtime = vi.hoisted(() => ({
  current: undefined as { runPromiseExit: (e: never) => unknown; dispose: () => Promise<void> } | undefined,
}));

vi.mock('../hostRuntime.ts', () => ({
  hostRuntime: { runPromiseExit: (effect: never) => runtime.current?.runPromiseExit(effect) },
}));

afterEach(async () => {
  cleanup();
  open.mockReset();
  await runtime.current?.dispose();
  runtime.current = undefined;
});

const renderPane = () => {
  runtime.current = ManagedRuntime.make(Layer.merge(mockHostLayer, Layer.succeed(OpenUrl, { open })));
  render(
    <ThemeProvider theme={theme}>
      <AboutSettingsPane />
    </ThemeProvider>,
  );
};

describe('AboutSettingsPane', () => {
  it.effect('opens the GitHub repo URL', () =>
    Effect.gen(function* () {
      open.mockReturnValue(Effect.void);
      renderPane();
      fireEvent.click(screen.getByRole('button', { name: 'View on GitHub' }));
      yield* Effect.promise(() =>
        waitFor(() => {
          expect(open).toHaveBeenCalledWith(GITHUB_REPO_URL);
        }),
      );
      expect(screen.queryByRole('alert')).toBeNull();
    }),
  );

  it.effect('shows a fallback message when opening fails', () =>
    Effect.gen(function* () {
      open.mockReturnValue(Effect.fail(new Error('nope')));
      renderPane();
      fireEvent.click(screen.getByRole('button', { name: 'View on GitHub' }));
      yield* Effect.promise(() =>
        waitFor(() => {
          expect(screen.getByRole('alert').textContent).toContain(`Visit ${GITHUB_REPO_URL}`);
        }),
      );
    }),
  );
});

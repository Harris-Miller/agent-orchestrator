// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Atom } from 'effect/reactivity';
import { AtomRegistry } from 'effect/reactivity';
import { afterEach, vi } from 'vitest';

import type { ProviderView, RuntimeView } from '../../host/providerView.ts';
import type { AppUpdateView } from '../../host/updatesView.ts';
import { providerViewsAtom } from '../../atoms/boundHarnessAtoms.ts';
import { theme } from '../../theme/themes.ts';

import { UpdatesIndicator } from './UpdatesIndicator.tsx';

const calls = vi.hoisted(() => ({ list: [] as string[] }));

// The bound atoms need a Host runtime; swap in recording writables.
vi.mock('../../atoms/boundHarnessAtoms.ts', async () => {
  const { Atom: A } = await import('effect/reactivity');
  const recorder = (name: string) => (id: string) =>
    A.writable(
      () => undefined,
      () => {
        calls.list.push(`${name}:${id}`);
      },
    );
  return {
    checkLatestAtomFn: recorder('checkLatest'),
    downloadAtomFn: recorder('download'),
    installAtomFn: recorder('install'),
    providerViewsAtom: A.make<readonly ProviderView[]>([]),
    recheckAtomFn: recorder('recheck'),
    refreshProviderAtomFn: A.writable(
      () => undefined,
      () => undefined,
    ),
    removeAtomFn: recorder('remove'),
    setProviderEnabledAtomFn: recorder('enable'),
    signInAntigravityAtomFn: A.writable(
      () => undefined,
      () => undefined,
    ),
  };
});

afterEach(() => {
  cleanup();
  calls.list.length = 0;
});

const runtime = (overrides: Partial<RuntimeView> = {}): RuntimeView => ({
  active: '1.0.0',
  cleanupFailures: [],
  documentError: undefined,
  downloaded: [],
  job: { _tag: 'Idle' },
  latest: { _tag: 'Available', version: '1.1.0' },
  ...overrides,
});

const view = (overrides: Partial<ProviderView> = {}): ProviderView => ({
  auth: 'SignedIn',
  cli: { _tag: 'Found', path: '/usr/bin/claude' },
  enabled: true,
  harnessError: undefined,
  id: 'claude-agent-acp',
  liveSessions: 0,
  runtime: runtime(),
  ...overrides,
});

const mount = (providers: readonly ProviderView[], appState?: AppUpdateView, onRetry: () => void = () => undefined) => {
  const registry = AtomRegistry.make();
  registry.set(providerViewsAtom as unknown as Atom.Writable<readonly ProviderView[]>, providers);
  render(
    <RegistryContext.Provider value={registry}>
      <ThemeProvider theme={theme}>
        <UpdatesIndicator
          app={
            appState === undefined
              ? undefined
              : {
                  onCheck: () => undefined,
                  onDownload: () => undefined,
                  onInstall: () => undefined,
                  onRetry,
                  state: appState,
                }
          }
          onOpenProviders={() => undefined}
        />
      </ThemeProvider>
    </RegistryContext.Provider>,
  );
  fireEvent.click(screen.getByLabelText('Updates'));
};

describe('UpdatesIndicator', () => {
  it('shows a count badge for pending updates', () => {
    mount([view(), view({ id: 'codex-acp' })]);
    assert.isNotNull(screen.queryByText('2'));
  });

  it('shows the empty state when nothing is pending', () => {
    mount([view({ runtime: runtime({ latest: { _tag: 'UpToDate' } }) })]);
    assert.isNotNull(screen.queryByText('Everything is up to date.'));
  });

  it('Download requests the download for that provider', () => {
    mount([view()]);
    fireEvent.click(screen.getByText('Download v1.1.0'));
    assert.deepStrictEqual(calls.list, ['download:claude-agent-acp']);
  });

  it('labels a Ready app update Restart', () => {
    mount([], { _tag: 'Ready', version: '2.0.0' });
    assert.isNotNull(screen.queryByText('Restart'));
  });

  it('shows a failed app update with a Retry button that retries', () => {
    const onRetry = vi.fn();
    mount([], { _tag: 'Failed', message: 'disk full' }, onRetry);
    assert.isNotNull(screen.queryByText(/disk full/));
    fireEvent.click(screen.getByText('Retry'));
    assert.strictEqual(onRetry.mock.calls.length, 1);
  });

  it('shows a failed provider job message and keeps the Download button', () => {
    mount([view({ runtime: runtime({ job: { _tag: 'Failed', detail: 'd', message: 'network down' } }) })]);
    assert.isNotNull(screen.queryByText('network down'));
    assert.isNotNull(screen.queryByText('Download v1.1.0'));
  });

  it('shows versions on ready and busy labels', () => {
    mount([view({ runtime: runtime({ downloaded: ['1.1.0'] }) })]);
    assert.isNotNull(screen.queryByText('Install v1.1.0'));
    cleanup();
    mount([], { _tag: 'Downloading', version: '2.0.0' });
    assert.isNotNull(screen.queryByText('Downloading v2.0.0…'));
  });
});

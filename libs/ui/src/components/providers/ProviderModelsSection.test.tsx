// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import { afterEach, vi } from 'vitest';

import { configOptionIndexAtom } from '../../atoms/backendState.atoms.ts';
import { userSettingsDocumentAtom } from '../../atoms/userSettings/userSettingsDocument.atoms.ts';
import { configOptionIndexFromProbeResponses, modelSelectOption } from '../../host/configOptionIndexFixtures.ts';
import { theme } from '../../theme/themes.ts';

import { ProviderModelsSection } from './ProviderModelsSection.tsx';

// The bound atom needs a Host runtime; swap in one that writes the User settings document directly.
vi.mock('../../atoms/boundHarnessAtoms.ts', async () => {
  const { AsyncResult: R, Atom: A } = await import('effect/reactivity');
  const doc = await import('../../atoms/userSettings/userSettingsDocument.atoms.ts');
  return {
    setModelPickerPrefsAtom: A.writable(
      () => undefined,
      (ctx, arg: { launchTarget: never; prefs: never }) => {
        ctx.set(
          doc.userSettingsDocumentAtom,
          R.success(
            doc.withModelPickerPrefs(
              doc.unwrapUserSettings(ctx.get(doc.userSettingsDocumentAtom)),
              arg.launchTarget,
              arg.prefs,
            ),
          ),
        );
      },
    ),
  };
});

afterEach(cleanup);

const mount = (modelIds: readonly string[] | undefined, settings: Record<string, unknown> = {}) => {
  const registry = AtomRegistry.make();
  registry.set(userSettingsDocumentAtom, AsyncResult.success(settings));
  if (modelIds !== undefined) {
    registry.set(
      configOptionIndexAtom('codex-acp'),
      configOptionIndexFromProbeResponses(modelIds[0]!, {
        [modelIds[0]!]: { configOptions: [modelSelectOption(modelIds[0]!, modelIds)] },
      }),
    );
  }
  render(
    <RegistryContext.Provider value={registry}>
      <ThemeProvider theme={theme}>
        <ProviderModelsSection launchTarget="codex-acp" />
      </ThemeProvider>
    </RegistryContext.Provider>,
  );
  const settingsNow = () => registry.get(userSettingsDocumentAtom);
  return { settingsNow };
};

const names = () => screen.getAllByLabelText(/^Show /).map(el => el.getAttribute('aria-label'));

describe('ProviderModelsSection', () => {
  it('shows an empty state without a cached Config option index', () => {
    mount(undefined);
    assert.isNotNull(screen.queryByText('Models appear after this provider first connects.'));
  });

  it('lists models in Model order with Hidden models last, and the count', () => {
    mount(['a', 'b', 'c'], { hiddenModels: { 'codex-acp': ['a'] }, modelOrder: { 'codex-acp': ['c'] } });
    assert.deepStrictEqual(names(), ['Show c', 'Show b', 'Show a']);
    assert.isNotNull(screen.queryByText('3 models · 1 hidden'));
    assert.isNotNull(screen.queryByText('Hidden from picker'));
  });

  it('writes hiddenModels when a switch is turned off', () => {
    const { settingsNow } = mount(['a', 'b']);
    fireEvent.click(screen.getByLabelText('Show a'));
    const value = AsyncResult.isSuccess(settingsNow()) ? settingsNow() : undefined;
    assert.deepStrictEqual((value as { value: { hiddenModels?: unknown } }).value.hiddenModels, {
      'codex-acp': ['a'],
    });
  });

  it('Disable all then Enable all', () => {
    mount(['a', 'b']);
    fireEvent.click(screen.getByRole('button', { name: 'Disable all' }));
    assert.isNotNull(screen.queryByText('2 models · 2 hidden'));
    fireEvent.click(screen.getByRole('button', { name: 'Enable all' }));
    assert.isNotNull(screen.queryByText('2 models · 0 hidden'));
  });

  it('reorders with Alt+ArrowDown on the handle and resets order', () => {
    mount(['a', 'b', 'c']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder a' }), { altKey: true, key: 'ArrowDown' });
    assert.deepStrictEqual(names(), ['Show b', 'Show a', 'Show c']);
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }));
    assert.deepStrictEqual(names(), ['Show a', 'Show b', 'Show c']);
  });

  it('shows the filter only above 8 models and disables reorder while filtering', () => {
    mount(['a', 'b']);
    assert.isNull(screen.queryByLabelText('Filter models'));
    cleanup();
    mount(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'x9']);
    fireEvent.change(screen.getByLabelText('Filter models'), { target: { value: 'x9' } });
    assert.deepStrictEqual(names(), ['Show x9']);
    assert.strictEqual(screen.getByRole('button', { name: 'Reorder x9' }).tabIndex, -1);
    assert.isNotNull(screen.queryByText('Clear the filter to reorder.'));
  });
});

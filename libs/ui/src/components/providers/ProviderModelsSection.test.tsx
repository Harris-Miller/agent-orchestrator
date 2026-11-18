// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import { afterEach, vi } from 'vitest';

import { configOptionIndexAtom } from '../../atoms/backendState.atoms.ts';
import { userSettingsDocumentAtom } from '../../atoms/userSettings/userSettingsDocument.atoms.ts';
import { configOptionIndexFromProbeResponses, modelSelectOption } from '../../host/configOptionIndexFixtures.ts';
import { theme } from '../../theme/themes.ts';

import { orderAfterDrop, ProviderModelsSection } from './ProviderModelsSection.tsx';

// The bound atom needs a Host runtime; swap in one that writes the User settings document directly.
vi.mock('../../atoms/boundHarnessAtoms.ts', async () => {
  const { AsyncResult: R, Atom: A } = await import('effect/reactivity');
  const doc = await import('../../atoms/userSettings/userSettingsDocument.atoms.ts');
  return {
    modelPickerPrefsAtom: doc.modelPickerPrefsAtom,
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = (modelIds: readonly string[] | undefined, settings: Record<string, unknown> = {}) => {
  const registry = AtomRegistry.make();
  registry.set(userSettingsDocumentAtom, AsyncResult.success(settings));
  if (modelIds !== undefined) {
    registry.set(
      configOptionIndexAtom('codex-acp'),
      configOptionIndexFromProbeResponses(modelIds[0], {
        [modelIds[0]]: { configOptions: [modelSelectOption(modelIds[0], modelIds)] },
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

/** Lets dnd-kit's microtask/animation-frame work settle between key presses. */
const tick = () =>
  new Promise<void>(resolve => {
    setTimeout(resolve, 50);
  });

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

  it('resets a custom Model order', () => {
    mount(['a', 'b', 'c'], { modelOrder: { 'codex-acp': ['b', 'a', 'c'] } });
    assert.deepStrictEqual(names(), ['Show b', 'Show a', 'Show c']);
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }));
    assert.deepStrictEqual(names(), ['Show a', 'Show b', 'Show c']);
  });

  it('reorders with the dnd-kit keyboard sensor on the handle', async () => {
    Object.assign(document, { getAnimations: () => [] });
    mount(['a', 'b', 'c']);
    // happy-dom does no layout; give each row its own 30px slot inside a large container so dnd-kit can tell rows apart.
    const slots = screen.getAllByLabelText(/^Show /).map(input => input.closest('.MuiStack-root'));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const slot = slots.indexOf(this);
      return slot === -1 ? new DOMRect(0, 0, 300, 1000) : new DOMRect(0, slot * 30, 300, 30);
    });
    const handle = screen.getByRole('button', { name: 'Reorder a' });
    handle.focus();
    fireEvent.keyDown(handle, { key: ' ' });
    await tick();
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    await tick();
    fireEvent.keyDown(handle, { key: ' ' });
    await waitFor(() => {
      assert.deepStrictEqual(names(), ['Show b', 'Show a', 'Show c']);
    });
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

describe('orderAfterDrop', () => {
  const advertised = ['a', 'b', 'c', 'd'];

  it('moves the dragged id into the dropped-on row slot', () => {
    assert.deepStrictEqual(orderAfterDrop(advertised, [], advertised, 'a', 2), ['b', 'c', 'a', 'd']);
    assert.deepStrictEqual(orderAfterDrop(advertised, [], advertised, 'd', 0), ['d', 'a', 'b', 'c']);
  });

  it('indexes into the shown rows while Hidden models keep their slots', () => {
    assert.deepStrictEqual(orderAfterDrop(advertised, [], ['a', 'c', 'd'], 'a', 1), ['b', 'c', 'a', 'd']);
  });

  it('keeps unadvertised ids last and returns undefined when nothing moved', () => {
    assert.deepStrictEqual(orderAfterDrop(advertised, ['gone'], advertised, 'a', 1), ['b', 'a', 'c', 'd', 'gone']);
    assert.isUndefined(orderAfterDrop(advertised, [], advertised, 'a', 0));
    assert.isUndefined(orderAfterDrop(advertised, [], advertised, 'a', 9));
  });
});

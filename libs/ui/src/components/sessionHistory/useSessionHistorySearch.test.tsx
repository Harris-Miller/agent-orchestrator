// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../../createHostRuntime.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { useSessionHistorySearch } = await import('./useSessionHistorySearch.tsx');

const entries = [
  { cwd: '/one', launchTarget: 'codex-acp' as const, sessionId: '1', title: 'Alpha' },
  { cwd: '/one', launchTarget: 'codex-acp' as const, sessionId: '2', title: 'Alpine', unavailable: true as const },
  { cwd: '/one', launchTarget: 'codex-acp' as const, sessionId: '3', title: 'Almanac' },
];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-index') ? 88 : 352;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(352);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(88000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return {
      height: this.hasAttribute('data-index') ? 88 : 352,
      width: 320,
      top: 0,
      left: 0,
      bottom: 352,
      right: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  });
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options === 'object') this.scrollTop = options.top ?? 0;
    this.dispatchEvent(new Event('scroll'));
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const Harness = ({ history = entries }: { history?: typeof entries } = {}) => {
  const search = useSessionHistorySearch({
    entries: history,
    scope: '/one',
    selectedSessionId: undefined,
    onClientError: () => undefined,
  });
  return (
    <>
      {search.field}
      {search.active ? search.results : <div>Browsing</div>}
    </>
  );
};

describe('Session History search controls', () => {
  it.effect('restores browsing for whitespace and Escape, and skips unavailable results', () =>
    Effect.sync(() => {
      const registry = AtomRegistry.make();
      updateHarnessSnapshot(registry, 'codex-acp', snapshot => ({ ...snapshot, phase: 'ready' }));
      render(
        <RegistryContext.Provider value={registry}>
          <Harness />
        </RegistryContext.Provider>,
      );
      const input = screen.getByRole('textbox', { name: 'Search sessions' });
      fireEvent.change(input, { target: { value: '  ' } });
      assert.isNotNull(screen.getByText('Browsing'));
      assert.isNotNull(screen.getByRole('button', { name: 'Clear search' }));
      fireEvent.change(input, { target: { value: 'Al' } });
      assert.isNotNull(screen.getByText('3 results'));
      fireEvent.click(screen.getByRole('button', { name: /Alpine/ }));
      assert.strictEqual((input as HTMLInputElement).value, 'Al');
      fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
      assert.strictEqual((input as HTMLInputElement).value, 'Al');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      assert.isNotNull(screen.getByText('Highlighted Alpha'));
      fireEvent.change(input, { target: { value: 'Al ' } });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      assert.isNotNull(screen.getByText('Highlighted Almanac'));
      fireEvent.change(input, { target: { value: 'Alp' } });
      fireEvent.change(input, { target: { value: 'Al' } });
      assert.isNotNull(screen.getByText('Highlighted Alpha'));
      fireEvent.keyDown(input, { key: 'Escape' });
      assert.isNotNull(screen.getByText('Browsing'));
      assert.strictEqual(document.activeElement, input);
      cleanup();
      registry.dispose();
    }),
  );
  it.effect('clears on keyboard and pointer activation', () =>
    Effect.sync(() => {
      const registry = AtomRegistry.make();
      updateHarnessSnapshot(registry, 'codex-acp', snapshot => ({ ...snapshot, phase: 'ready' }));
      render(
        <RegistryContext.Provider value={registry}>
          <Harness />
        </RegistryContext.Provider>,
      );
      const input = screen.getByRole('textbox', { name: 'Search sessions' }) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Al' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      assert.strictEqual(input.value, '');
      fireEvent.change(input, { target: { value: 'Al' } });
      fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
      assert.strictEqual(input.value, '');
      cleanup();
      registry.dispose();
    }),
  );
  it.effect('bounds mounted results and navigates beyond the initial window', () =>
    Effect.sync(() => {
      const registry = AtomRegistry.make();
      updateHarnessSnapshot(registry, 'codex-acp', snapshot => ({ ...snapshot, phase: 'ready' }));
      const history = Array.from({ length: 1000 }, (_, index) => ({
        cwd: '/one',
        launchTarget: 'codex-acp' as const,
        sessionId: String(index),
        title: `Session ${String(index).padStart(4, '0')}`,
      }));
      render(
        <RegistryContext.Provider value={registry}>
          <Harness history={history} />
        </RegistryContext.Provider>,
      );
      const input = screen.getByRole('textbox', { name: 'Search sessions' });
      fireEvent.change(input, { target: { value: 'Session' } });
      assert.isNotNull(screen.getByText('1000 results'));
      assert.isBelow(document.querySelectorAll('[data-index]').length, 40);
      for (let index = 0; index < 50; index += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
      assert.isNotNull(screen.getByText('Highlighted Session 0050'));
      assert.isNotNull(screen.getByRole('button', { name: 'Session 0050' }));
      assert.isBelow(document.querySelectorAll('[data-index]').length, 40);
      const activeRow = screen.getByRole('button', { name: 'Session 0050' });
      fireEvent.focus(activeRow);
      const viewport = document.querySelector('[data-index]')!.parentElement!.parentElement!;
      fireEvent.scroll(viewport, { target: { scrollTop: 80000 } });
      assert.isNotNull(screen.getByRole('button', { name: 'Session 0050' }));
      assert.isBelow(document.querySelectorAll('[data-index]').length, 40);
      fireEvent.blur(activeRow);
      assert.isNull(screen.queryByRole('button', { name: 'Session 0050' }));
      fireEvent.change(input, { target: { value: 'Session 000' } });
      assert.isNotNull(screen.getByText('Highlighted Session 0000'));
      registry.dispose();
    }),
  );
});

// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const Harness = () => {
  const search = useSessionHistorySearch({
    entries,
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
      const highlightedRow = document.querySelector('[data-highlighted="true"]')!;
      let scrollCalls = 0;
      highlightedRow.scrollIntoView = () => {
        scrollCalls += 1;
      };
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      assert.strictEqual(scrollCalls, 1);
      fireEvent.change(input, { target: { value: 'Al ' } });
      assert.isAbove(scrollCalls, 1);
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
});

// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Atom, AtomRegistry } from 'effect/reactivity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtomsTab } from './AtomsTab.tsx';

const labeled = <A,>(value: A, label: string) => Atom.make(value).pipe(Atom.withLabel(label), Atom.keepAlive);

const ENABLE = { name: 'Enable Atom inspector' };

const setup = ({ enable = true }: { readonly enable?: boolean } = {}) => {
  const registry = AtomRegistry.make();
  const flag = labeled(true, 'flag');
  const items = labeled(new Map([['key', { nested: 7 }]]), 'items');
  registry.get(flag);
  registry.get(items);
  registry.get(Atom.make('hidden-value').pipe(Atom.keepAlive));
  render(
    <RegistryContext.Provider value={registry}>
      <AtomsTab onCopyError={vi.fn()} />
    </RegistryContext.Provider>,
  );
  if (enable) {
    fireEvent.click(screen.getByRole('button', ENABLE));
  }
  return { flag, items, registry };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  delete window.__HOA__;
  vi.useRealTimers();
});

describe('AtomsTab', () => {
  it('shows only the enable button, and no bridge or Atoms, until it is clicked', () => {
    const { registry } = setup({ enable: false });
    expect(screen.queryByText('flag')).toBeNull();
    expect(window.__HOA__).toBeUndefined();

    fireEvent.click(screen.getByRole('button', ENABLE));

    expect(screen.queryByRole('button', ENABLE)).toBeNull();
    expect(screen.getByText('flag')).toBeDefined();
    expect(window.__HOA__?.atoms.get('flag')).toBe(true);
    expect(window.__HOA__?.atoms.list().map(({ label }) => label)).toEqual(['flag', 'items']);
    expect(registry.getNodes().size).toBe(3);
  });

  it('lists atoms by label and shows the value in a form fitting its type when expanded', () => {
    setup();
    expect(screen.getByText('flag')).toBeDefined();
    expect(screen.getByText('items')).toBeDefined();
    expect(screen.queryByText('nested')).toBeNull();

    fireEvent.click(screen.getByText('items'));
    expect(screen.getByText('Map(1)')).toBeDefined();
    expect(screen.getByText('key')).toBeDefined();
    expect(screen.getByText('nested')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();

    fireEvent.click(screen.getByText('flag'));
    expect(screen.getAllByText('true').length).toBeGreaterThan(0);
  });

  it('hides internal (unnamed) atoms until asked', () => {
    setup();
    expect(screen.queryByText(/^anonymous#/)).toBeNull();

    fireEvent.click(screen.getByLabelText('Show internal Atoms'));

    expect(screen.getByText(/^anonymous#/)).toBeDefined();
  });

  it('filters atoms by label', () => {
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter atoms' }), { target: { value: 'ite' } });
    expect(screen.queryByText('flag')).toBeNull();
    expect(screen.getByText('items')).toBeDefined();
  });

  it('shows registry changes on the next poll', () => {
    const { flag, registry } = setup();
    fireEvent.click(screen.getByText('flag'));
    expect(screen.queryByText('false')).toBeNull();

    registry.set(flag, false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getAllByText('false').length).toBeGreaterThan(0);
  });
});

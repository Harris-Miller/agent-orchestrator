// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Atom, AtomRegistry } from 'effect/reactivity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtomsTab } from './AtomsTab.tsx';

const labeled = <A,>(value: A, label: string) => Atom.make(value).pipe(Atom.withLabel(label), Atom.keepAlive);

const setup = () => {
  const registry = AtomRegistry.make();
  const flag = labeled(true, 'flag');
  const items = labeled(new Map([['key', { nested: 7 }]]), 'items');
  registry.get(flag);
  registry.get(items);
  render(
    <RegistryContext.Provider value={registry}>
      <AtomsTab onCopyError={vi.fn()} />
    </RegistryContext.Provider>,
  );
  return { flag, items, registry };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AtomsTab', () => {
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

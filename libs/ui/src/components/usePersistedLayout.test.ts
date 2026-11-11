import { assert, describe, it, vi } from '@effect/vitest';

import { isFiniteNumberArray, loadPersistedLayout } from './usePersistedLayout.ts';

describe('isFiniteNumberArray', () => {
  it('accepts exactly `length` finite numbers', () => {
    assert.isTrue(isFiniteNumberArray([1, 2], 2));
    assert.isFalse(isFiniteNumberArray([1, 2], 3));
    assert.isFalse(isFiniteNumberArray([1, Number.NaN], 2));
    assert.isFalse(isFiniteNumberArray([1, '2'], 2));
    assert.isFalse(isFiniteNumberArray('12', 2));
  });
});

describe('loadPersistedLayout', () => {
  const parse = (raw: Record<string, unknown>) => ({ open: raw.open === true });
  const withStorage = (stored: string | null, run: () => void) => {
    vi.stubGlobal('localStorage', { getItem: () => stored });
    try {
      run();
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it('parses a stored object', () => {
    withStorage('{"open":true}', () => {
      assert.deepStrictEqual(loadPersistedLayout('k', parse), { open: true });
    });
  });

  it('falls back to the defaults for nothing stored, corrupt JSON or a non-object', () => {
    for (const stored of [null, '{nope', '"text"', 'null']) {
      withStorage(stored, () => {
        assert.deepStrictEqual(loadPersistedLayout('k', parse), { open: false });
      });
    }
  });

  it('falls back to the defaults when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    try {
      assert.deepStrictEqual(loadPersistedLayout('k', parse), { open: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

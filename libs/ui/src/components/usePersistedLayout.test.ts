import { assert, describe, it } from '@effect/vitest';

import { isFiniteNumberArray } from './usePersistedLayout.ts';

describe('isFiniteNumberArray', () => {
  it('accepts exactly `length` finite numbers', () => {
    assert.isTrue(isFiniteNumberArray([1, 2], 2));
    assert.isFalse(isFiniteNumberArray([1, 2], 3));
    assert.isFalse(isFiniteNumberArray([1, Number.NaN], 2));
    assert.isFalse(isFiniteNumberArray([1, '2'], 2));
    assert.isFalse(isFiniteNumberArray('12', 2));
  });
});

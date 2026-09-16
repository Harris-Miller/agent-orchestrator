import { assert, describe, it } from '@effect/vitest';

import { confirmSessionDeleteEnabled } from './confirmSessionDelete.ts';

describe('confirmSessionDeleteEnabled', () => {
  it('defaults to true when unset', () => {
    assert.isTrue(confirmSessionDeleteEnabled({}));
  });

  it('is true when explicitly true', () => {
    assert.isTrue(confirmSessionDeleteEnabled({ confirmSessionDelete: true }));
  });

  it('is false when explicitly false', () => {
    assert.isFalse(confirmSessionDeleteEnabled({ confirmSessionDelete: false }));
  });
});

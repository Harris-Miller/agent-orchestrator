import { assert, describe, it } from '@effect/vitest';

import { developerModeEnabled } from './userSettings.atoms.ts';

describe('developerModeEnabled', () => {
  it('defaults to false when unset', () => {
    assert.isFalse(developerModeEnabled({}));
  });

  it('is true when explicitly true', () => {
    assert.isTrue(developerModeEnabled({ developerModeEnabled: true }));
  });

  it('is false when explicitly false', () => {
    assert.isFalse(developerModeEnabled({ developerModeEnabled: false }));
  });
});

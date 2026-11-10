import { assert, describe, it } from '@effect/vitest';

import { showEmptyCwdGroupsEnabled } from './userSettings.atoms.ts';

describe('showEmptyCwdGroupsEnabled', () => {
  it('defaults to true when unset', () => {
    assert.isTrue(showEmptyCwdGroupsEnabled({}));
  });

  it('is true when explicitly true', () => {
    assert.isTrue(showEmptyCwdGroupsEnabled({ showEmptyCwdGroups: true }));
  });

  it('is false when explicitly false', () => {
    assert.isFalse(showEmptyCwdGroupsEnabled({ showEmptyCwdGroups: false }));
  });
});

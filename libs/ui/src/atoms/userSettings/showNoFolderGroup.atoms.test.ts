import { assert, describe, it } from '@effect/vitest';

import { showNoFolderGroupEnabled } from './showNoFolderGroup.atoms.ts';

describe('showNoFolderGroupEnabled', () => {
  it('defaults to true when unset', () => {
    assert.isTrue(showNoFolderGroupEnabled({}));
  });

  it('is true when explicitly true', () => {
    assert.isTrue(showNoFolderGroupEnabled({ showNoFolderGroup: true }));
  });

  it('is false when explicitly false', () => {
    assert.isFalse(showNoFolderGroupEnabled({ showNoFolderGroup: false }));
  });
});

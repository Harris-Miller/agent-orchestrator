import { assert, describe, it } from '@effect/vitest';

import { workstreamsEnabled } from './userSettingsDocument.atoms.ts';

describe('workstreamsEnabled', () => {
  it('is off when unset or false, on only when true', () => {
    assert.isFalse(workstreamsEnabled({}));
    assert.isFalse(workstreamsEnabled({ workstreamsEnabled: false }));
    assert.isTrue(workstreamsEnabled({ workstreamsEnabled: true }));
  });
});

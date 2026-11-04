import { assert, describe, it } from '@effect/vitest';

import { isArchivedEntry } from './airMeta.ts';

describe('isArchivedEntry', () => {
  it('reads _meta.jetbrains.air.archived', () => {
    assert.isTrue(isArchivedEntry({ _meta: { jetbrains: { air: { archived: true } } } }));
    assert.isFalse(isArchivedEntry({ _meta: { jetbrains: { air: { archived: false } } } }));
    assert.isFalse(isArchivedEntry({ _meta: { provider: { archived: true } } }));
    assert.isFalse(isArchivedEntry({}));
  });
});

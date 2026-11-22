import { assert, describe, it } from '@effect/vitest';

import { trackerChipLabel } from './workstreamViews.ts';

describe('workstreamViews', () => {
  it('labels tracker chips with the provider name', () => {
    assert.strictEqual(trackerChipLabel({ key: '#185', provider: 'github' }), 'GitHub #185');
  });
});

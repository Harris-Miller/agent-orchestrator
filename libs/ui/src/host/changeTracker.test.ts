import { assert, describe, it } from '@effect/vitest';

import { makeChangeTracker } from './changeTracker.ts';

describe('makeChangeTracker', () => {
  it('reports a change only after a first value was seen and the value differs', () => {
    const tracker = makeChangeTracker();
    assert.isFalse(tracker.changed(false));
    assert.isFalse(tracker.changed(false));
    assert.isTrue(tracker.changed(true));
    assert.isFalse(tracker.changed(true));
    assert.isTrue(tracker.changed(false));
  });
});

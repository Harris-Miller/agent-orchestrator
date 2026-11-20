import { assert, describe, it } from '@effect/vitest';

import { activityBadgeOf } from './sessionRowMeta.ts';

describe('activityBadgeOf', () => {
  const live = { available: true, pendingClientRequest: false };

  it('shows the Activity state of an available row', () => {
    assert.strictEqual(activityBadgeOf({ activityState: 'running' }, live), 'running');
    assert.strictEqual(activityBadgeOf({ activityState: 'error' }, live), 'error');
  });

  it('shows nothing without a state, when unavailable, or while the pending spinner shows', () => {
    assert.isUndefined(activityBadgeOf({}, live));
    assert.isUndefined(activityBadgeOf({ activityState: 'running' }, { ...live, available: false }));
    assert.isUndefined(activityBadgeOf({ activityState: 'requires_action' }, { ...live, pendingClientRequest: true }));
  });
});

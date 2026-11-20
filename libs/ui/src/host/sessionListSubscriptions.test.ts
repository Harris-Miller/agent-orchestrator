import { assert, describe, it } from '@effect/vitest';

import { MAX_SESSION_LIST_SUBSCRIPTIONS, planSessionListSubscriptions } from './sessionListSubscriptions.ts';

describe('planSessionListSubscriptions', () => {
  it('subscribes added cwds and unsubscribes removed ones', () => {
    assert.deepStrictEqual(planSessionListSubscriptions(['/a', '/b'], ['/b', '/c']), {
      subscribe: ['/a'],
      unsubscribe: ['/c'],
    });
  });

  it('is a no-op when desired equals current', () => {
    assert.deepStrictEqual(planSessionListSubscriptions(['/a'], ['/a']), { subscribe: [], unsubscribe: [] });
  });

  it('handles empty desired and empty current', () => {
    assert.deepStrictEqual(planSessionListSubscriptions([], ['/a']), { subscribe: [], unsubscribe: ['/a'] });
    assert.deepStrictEqual(planSessionListSubscriptions(['/a'], []), { subscribe: ['/a'], unsubscribe: [] });
    assert.deepStrictEqual(planSessionListSubscriptions([], []), { subscribe: [], unsubscribe: [] });
  });

  it('deduplicates desired cwds', () => {
    assert.deepStrictEqual(planSessionListSubscriptions(['/a', '/a'], []).subscribe, ['/a']);
  });

  it('subscribes at most 128 cwds in the given order; the rest fall back to re-list', () => {
    const desired = Array.from({ length: MAX_SESSION_LIST_SUBSCRIPTIONS + 5 }, (_, index) => `/p${index}`);
    const { subscribe, unsubscribe } = planSessionListSubscriptions(desired, []);
    assert.strictEqual(MAX_SESSION_LIST_SUBSCRIPTIONS, 128);
    assert.deepStrictEqual(subscribe, desired.slice(0, 128));
    assert.deepStrictEqual(unsubscribe, []);
  });

  it('unsubscribes a current cwd pushed past the cap', () => {
    const desired = [...Array.from({ length: 128 }, (_, index) => `/p${index}`), '/late'];
    const plan = planSessionListSubscriptions(desired, ['/late', ...desired.slice(0, 127)]);
    assert.deepStrictEqual(plan, { subscribe: ['/p127'], unsubscribe: ['/late'] });
  });
});

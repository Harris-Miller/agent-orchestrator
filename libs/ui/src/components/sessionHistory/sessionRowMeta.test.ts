import { assert, describe, it } from '@effect/vitest';

import {
  activityBadgeOf,
  DEFAULT_SESSION_TITLE,
  forkSourceTitleOf,
  formatCost,
  rowMetaLine,
  rowMetaParts,
} from './sessionRowMeta.ts';

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

describe('formatCost', () => {
  it('formats a valid currency', () => {
    assert.strictEqual(
      formatCost({ amount: 1.5, currency: 'USD' }),
      new Intl.NumberFormat(undefined, { currency: 'USD', style: 'currency' }).format(1.5),
    );
  });

  it('falls back for an invalid currency code', () => {
    assert.strictEqual(formatCost({ amount: 2, currency: 'not-a-code' }), '2 not-a-code');
  });
});

describe('rowMetaLine', () => {
  it('has no parts and no line for a row without metadata', () => {
    assert.deepStrictEqual(rowMetaParts({}, undefined), []);
    assert.isUndefined(
      rowMetaLine({ activityState: 'running', lastPromptTime: '2026-01-01T00:00:00.000Z' }, undefined),
    );
  });

  it('joins model, cost and Fork source with a middle dot', () => {
    assert.strictEqual(
      rowMetaLine({ cost: { amount: 2, currency: 'bad!' }, forkSource: 'p1', model: 'opus' }, 'Parent'),
      'opus · 2 bad! · Forked from Parent',
    );
  });

  it('labels an unknown Fork source by its truncated id', () => {
    assert.strictEqual(rowMetaLine({ forkSource: 'abcdefghijklmnop' }, undefined), 'Forked from abcdefgh…mnop');
  });
});

describe('forkSourceTitleOf', () => {
  const history = [{ sessionId: 'a', title: 'Alpha' }, { sessionId: 'b' }] as never;

  it('finds the title, defaults an untitled row, and reads unknown / absent sources as undefined', () => {
    assert.strictEqual(forkSourceTitleOf(history, 'a'), 'Alpha');
    assert.strictEqual(forkSourceTitleOf(history, 'b'), DEFAULT_SESSION_TITLE);
    assert.isUndefined(forkSourceTitleOf(history, 'zzz'));
    assert.isUndefined(forkSourceTitleOf(history, undefined));
  });
});

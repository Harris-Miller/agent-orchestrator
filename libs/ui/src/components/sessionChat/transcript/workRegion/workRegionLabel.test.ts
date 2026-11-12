import { assert, describe, it } from '@effect/vitest';

import type { ChatItem } from '../../../../host/sessionUpdateReducer.ts';

import type { WorkRegion } from './groupChatItems.ts';
import { workRegionLabel } from './workRegionLabel.ts';

const u = (id: string, extra: object = {}): ChatItem => ({ id, kind: 'user_message', text: id, ...extra });

describe('workRegionLabel', () => {
  const region = (userMessage: ChatItem): WorkRegion => ({
    id: 'r',
    isLastInTurn: true,
    isLastTurn: true,
    items: [],
    kind: 'work_region',
    userMessage: userMessage as WorkRegion['userMessage'],
  });
  it('in flight without a start stamp', () => {
    assert.strictEqual(workRegionLabel(region(u('u')), true, 0, 'Worked'), 'Working…');
  });
  it('in flight counts up', () => {
    const r = region(u('u', { startedAt: 1000 }));
    assert.strictEqual(workRegionLabel(r, true, 1000, 'Worked'), 'Working for 0s');
    assert.strictEqual(workRegionLabel(r, true, 33_000, 'Worked'), 'Working for 32s');
    assert.strictEqual(workRegionLabel(r, true, 66_000, 'Worked'), 'Working for 1m 5s');
  });
  it('with stamps', () => {
    assert.strictEqual(
      workRegionLabel(region(u('u', { endedAt: 142_000, startedAt: 1000 })), false, 0, 'Worked'),
      'Worked for 2m 21s',
    );
    assert.strictEqual(
      workRegionLabel(region(u('u', { endedAt: 15_000, startedAt: 1000 })), false, 0, 'Worked'),
      'Worked for 14s',
    );
  });
  it('non-last region uses the supplied label even with stamps', () => {
    const r = { ...region(u('u', { endedAt: 142_000, startedAt: 1000 })), isLastInTurn: false };
    assert.strictEqual(workRegionLabel(r, false, 0, 'Worked a bit'), 'Worked a bit');
    assert.strictEqual(workRegionLabel(r, true, 5000, 'Worked a bit'), 'Worked a bit');
  });
  it('without stamps uses the supplied label', () => {
    assert.strictEqual(workRegionLabel(region(u('u')), false, 0, 'Worked for a bit'), 'Worked for a bit');
  });
});

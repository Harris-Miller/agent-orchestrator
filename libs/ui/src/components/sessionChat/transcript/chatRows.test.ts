import { assert, describe, it } from '@effect/vitest';

import type { ChatItem } from '../../../host/sessionUpdateReducer.ts';

import { chatRowKey, withKeptRows } from './chatRows.ts';
import type { WorkRegion } from './workRegion/groupChatItems.ts';

describe('chatRowKey', () => {
  it('prefixes Work regions and leaves items as their id', () => {
    const region = { id: 'a', kind: 'work_region' } as unknown as WorkRegion;
    const item = { id: 'a', kind: 'agent_message' } as unknown as ChatItem;
    assert.strictEqual(chatRowKey(region), 'work-a');
    assert.strictEqual(chatRowKey(item), 'a');
  });
});

describe('withKeptRows', () => {
  it('unions, dedupes and sorts', () => {
    assert.deepStrictEqual(withKeptRows([4, 5, 6], [1, 5]), [1, 4, 5, 6]);
  });
});

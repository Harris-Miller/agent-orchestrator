import { assert, describe, it } from '@effect/vitest';

import { chatItemsFromAccumulator, emptyChatAccumulator, reduceSessionUpdate } from './sessionUpdateReducer.ts';

describe('reduceSessionUpdate', () => {
  it('ignores session_info_update (no chat item)', () => {
    const next = reduceSessionUpdate(emptyChatAccumulator(), {
      sessionUpdate: 'session_info_update',
      title: 'Implement auth',
      updatedAt: '2026-09-01T00:00:00Z',
    });

    assert.deepStrictEqual(chatItemsFromAccumulator(next), []);
  });
});

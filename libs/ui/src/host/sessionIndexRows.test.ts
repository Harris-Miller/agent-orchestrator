import { assert, describe, it } from '@effect/vitest';

import { indexRowsByCwd } from './sessionIndexRows.ts';

describe('indexRowsByCwd', () => {
  it('groups rows under listed cwds only, strips unavailable, and keys an emptied cwd', () => {
    assert.deepStrictEqual(
      indexRowsByCwd(
        [
          { cwd: '/a', sessionId: 'a1', unavailable: true },
          { cwd: '/other', sessionId: 'o1' },
        ],
        ['/a', '/empty'],
      ),
      { '/a': [{ cwd: '/a', sessionId: 'a1' }], '/empty': [] },
    );
  });
});

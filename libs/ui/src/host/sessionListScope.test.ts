import { assert, describe, it } from '@effect/vitest';

import { listSessionsPayload, sessionListScopeFromPaths, unscopedSessionListScope } from './sessionListScope.ts';

describe('sessionListScope', () => {
  it('sessionListScopeFromPaths maps empty to Skip and first path to Cwd', () => {
    assert.deepStrictEqual(sessionListScopeFromPaths([]), { _tag: 'Skip' });
    assert.deepStrictEqual(sessionListScopeFromPaths(['/a', '/b']), { _tag: 'Cwd', cwd: '/a' });
  });

  it('listSessionsPayload covers Unscoped / Cwd / Skip', () => {
    const archivedAll = {
      _meta: { jetbrains: { air: { list: { archived: 'all' as const }, version: 1 as const } } },
    };
    assert.deepStrictEqual(listSessionsPayload(unscopedSessionListScope), archivedAll);
    assert.deepStrictEqual(listSessionsPayload({ _tag: 'Cwd', cwd: '/ws' }), { ...archivedAll, cwd: '/ws' });
    assert.strictEqual(listSessionsPayload({ _tag: 'Skip' }), undefined);
  });
});

import { assert, describe, it } from '@effect/vitest';

import { pinsToUnpinAfterList } from './pinnedSessions.ts';

const pins = [
  { cwd: '/a', sessionId: 'gone-a' },
  { cwd: '/b', sessionId: 'gone-b' },
  { cwd: '/a', sessionId: 'kept' },
];
const listed = { sessions: [{ cwd: '/a', sessionId: 'kept' }] };

describe('pinsToUnpinAfterList', () => {
  it('unscoped sweeps every pin missing from the list', () => {
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, listed, { _tag: 'Unscoped' }), ['gone-a', 'gone-b']);
  });

  it('cwd scope only sweeps pins whose stored cwd equals the scope cwd', () => {
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, listed, { _tag: 'Cwd', cwd: '/a' }), ['gone-a']);
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, listed, { _tag: 'Cwd', cwd: '/a/' }), []);
  });

  it('skips partial pages and Skip scope', () => {
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, { ...listed, nextCursor: 'c' }, { _tag: 'Unscoped' }), []);
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, listed, { _tag: 'Skip' }), []);
  });

  it('counts archived rows as listed (raw ids)', () => {
    const withArchived = { sessions: [{ _meta: { jetbrains: { air: { archived: true } } }, sessionId: 'gone-a' }] };
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, withArchived, { _tag: 'Unscoped' }), ['gone-b', 'kept']);
  });
});

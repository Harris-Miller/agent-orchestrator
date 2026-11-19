import { assert, describe, it } from '@effect/vitest';

import { pinsToUnpinAfterList } from './pinnedSessions.ts';

const pins = [
  { cwd: '/a', sessionId: 'gone-a' },
  { cwd: '/b', sessionId: 'gone-b' },
  { cwd: '/a', sessionId: 'kept' },
];

describe('pinsToUnpinAfterList', () => {
  it('only sweeps pins whose stored cwd equals the listed cwd and are missing from the list', () => {
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, new Set(['kept']), '/a'), ['gone-a']);
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, new Set(['kept']), '/b'), ['gone-b']);
  });

  it('never sweeps a pin outside the listed cwd, nor with a differing path spelling', () => {
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, new Set(), '/a/'), []);
    assert.deepStrictEqual(pinsToUnpinAfterList(pins, new Set(), '/other'), []);
  });
});

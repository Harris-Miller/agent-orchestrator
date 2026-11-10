import { assert, describe, it } from '@effect/vitest';

import { cwdsToTrack } from './cwdsToTrack.ts';

const row = (cwd: string) => ({ cwd });

describe('cwdsToTrack', () => {
  it('returns the distinct cwds of visible rows that are not tracked yet', () => {
    assert.deepStrictEqual(cwdsToTrack([row('/a'), row('/b'), row('/a'), row('/c')], ['/c']), ['/a', '/b']);
  });

  it('returns nothing when every cwd is tracked or there are no rows', () => {
    assert.deepStrictEqual(cwdsToTrack([row('/a')], ['/a']), []);
    assert.deepStrictEqual(cwdsToTrack([], []), []);
  });

  it('never tracks No Folder cwds', () => {
    assert.deepStrictEqual(
      cwdsToTrack(
        [row('/Users/me/Library/Claude/scratch-workspaces/scratch-2026-03-15-a1b2c3'), row('/Users/me/app')],
        [],
      ),
      ['/Users/me/app'],
    );
  });
});

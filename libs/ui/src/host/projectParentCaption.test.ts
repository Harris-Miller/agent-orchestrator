import { assert, describe, it } from '@effect/vitest';

import { projectParentCaption } from './projectParentCaption.ts';

describe('projectParentCaption', () => {
  it('is only present when another Project shares the basename (case-insensitive)', () => {
    const projects = ['/a/app', '/b/App', '/c/other'];
    assert.strictEqual(projectParentCaption('/a/app', projects), '/a');
    assert.strictEqual(projectParentCaption('/b/App', projects), '/b');
    assert.isUndefined(projectParentCaption('/c/other', projects));
  });

  it('ignores trailing separators', () => {
    assert.strictEqual(projectParentCaption('/a/app/', ['/a/app/', '/b/app']), '/a');
  });
});

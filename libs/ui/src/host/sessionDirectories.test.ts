import { assert, describe, it } from '@effect/vitest';

import { normalizeSessionInfo } from './acpSessionBootstrap.ts';
import { resolveSessionDirectories, sameDirectories } from './sessionDirectories.ts';

describe('resolveSessionDirectories', () => {
  it('prefers the snapshot Session, else the History entry', () => {
    assert.deepStrictEqual(
      resolveSessionDirectories(
        { additionalDirectories: ['/snap'], workspaceFile: '/snap.code-workspace' },
        { additionalDirectories: ['/history'], workspaceFile: '/history.code-workspace' },
      ),
      { additionalDirectories: ['/snap'], workspaceFile: '/snap.code-workspace' },
    );
    assert.deepStrictEqual(
      resolveSessionDirectories({}, { additionalDirectories: ['/history'], workspaceFile: '/history.code-workspace' }),
      { additionalDirectories: ['/history'], workspaceFile: '/history.code-workspace' },
    );
    assert.deepStrictEqual(resolveSessionDirectories(undefined, undefined), {});
  });

  it('treats an empty list as absent, so the History entry fills in', () => {
    assert.deepStrictEqual(
      resolveSessionDirectories({ additionalDirectories: [] }, { additionalDirectories: ['/h'] }),
      {
        additionalDirectories: ['/h'],
      },
    );
    assert.deepStrictEqual(resolveSessionDirectories({ additionalDirectories: [] }, undefined), {});
  });
});

describe('sameDirectories', () => {
  it('compares as a set: order and duplicates do not matter, empty equals absent', () => {
    assert.isTrue(sameDirectories(['/a', '/b'], ['/b', '/a']));
    assert.isTrue(sameDirectories(['/a', '/a'], ['/a']));
    assert.isTrue(sameDirectories([], undefined));
    assert.isTrue(sameDirectories(undefined, undefined));
    assert.isFalse(sameDirectories(['/a'], ['/a', '/b']));
    assert.isFalse(sameDirectories(['/a'], undefined));
  });
});

describe('normalizeSessionInfo directories', () => {
  it('never lifts Additional directories or a workspace file off a session/list row', () => {
    const row = normalizeSessionInfo({
      additionalDirectories: ['/a'],
      cwd: '/w',
      sessionId: 's1',
      workspaceFile: '/w/app.code-workspace',
    });
    assert.isDefined(row);
    assert.isFalse('additionalDirectories' in row);
    assert.isFalse('workspaceFile' in row);
  });
});

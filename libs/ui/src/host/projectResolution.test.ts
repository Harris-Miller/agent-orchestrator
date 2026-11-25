import { assert, describe, it } from '@effect/vitest';

import { projectLabel, projectOfRecord, resolvedProjectCwds, resolveProject } from './projectResolution.ts';
import type { WorkspaceFileStates } from './projectResolution.ts';

const W1 = '/ws/one.code-workspace';
const W2 = '/ws/two.code-workspace';
const states: WorkspaceFileStates = {
  [W1]: { _tag: 'Resolved', folders: ['/a', '/b', '/c'] },
  [W2]: { _tag: 'Failed', message: 'The workspace file could not be read' },
};

describe('resolveProject', () => {
  it('is the identity for a directory Project', () => {
    assert.deepStrictEqual(resolveProject('/a', states), { _tag: 'Ready', additionalDirectories: [], cwd: '/a' });
  });

  it('resolves a Workspace project to its first folder, the rest and the file', () => {
    assert.deepStrictEqual(resolveProject(W1, states), {
      _tag: 'Ready',
      additionalDirectories: ['/b', '/c'],
      cwd: '/a',
      workspaceFile: W1,
    });
  });

  it('is an error when the file failed and pending when it was never read', () => {
    assert.deepStrictEqual(resolveProject(W2, states), {
      _tag: 'Error',
      message: 'The workspace file could not be read',
    });
    assert.deepStrictEqual(resolveProject('/x/new.code-workspace', states), { _tag: 'Pending' });
  });
});

describe('resolvedProjectCwds', () => {
  it('lists the cwd of every ready Project once, skipping errored and pending ones', () => {
    assert.deepStrictEqual(resolvedProjectCwds(['/a', W1, W2, '/z', '/x/new.code-workspace'], states), ['/a', '/z']);
    assert.deepStrictEqual(resolvedProjectCwds([W1, '/q'], states), ['/a', '/q']);
  });
});

describe('projectOfRecord', () => {
  const projects = ['/a', W1, W2];

  it('puts a record stamped with a Workspace project there, even when it is errored', () => {
    assert.strictEqual(projectOfRecord({ cwd: '/a', workspaceFile: W1 }, projects), W1);
    assert.strictEqual(projectOfRecord({ cwd: '/a', workspaceFile: W2 }, projects), W2);
  });

  it('falls back to the directory Project of its cwd, so a directory Project loses nothing', () => {
    assert.strictEqual(projectOfRecord({ cwd: '/a' }, projects), '/a');
    assert.strictEqual(projectOfRecord({ cwd: '/a', workspaceFile: '/other.code-workspace' }, projects), '/a');
  });

  it('belongs to no Project when neither matches', () => {
    assert.isUndefined(projectOfRecord({ cwd: '/b' }, projects));
    assert.isUndefined(projectOfRecord({ cwd: '/b', workspaceFile: '/other.code-workspace' }, projects));
  });
});

describe('projectLabel', () => {
  it('is the file name without the extension for a Workspace project, else the basename', () => {
    assert.strictEqual(projectLabel(W1), 'one');
    assert.strictEqual(projectLabel('/x/My App.Code-Workspace'), 'My App');
    assert.strictEqual(projectLabel('/a/app/'), 'app');
  });
});

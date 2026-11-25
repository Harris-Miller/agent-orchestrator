import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';

import { projectDisplayAtom, projectsAtom } from './projects.atoms.ts';
import { workspaceFilesAtom } from './workspaceFiles.atoms.ts';

describe('projectDisplayAtom', () => {
  it('shows the basename with no caption for a unique basename', () => {
    const registry = AtomRegistry.make();
    registry.set(projectsAtom, ['/work/alpha', '/work/beta']);
    assert.deepStrictEqual(registry.get(projectDisplayAtom('/work/alpha')), {
      error: undefined,
      label: 'alpha',
      parentCaption: undefined,
    });
  });

  it('shows the parent path when another Project shares the basename, case-insensitively', () => {
    const registry = AtomRegistry.make();
    registry.set(projectsAtom, ['/work/app', '/other/App']);
    assert.deepStrictEqual(registry.get(projectDisplayAtom('/work/app')), {
      error: undefined,
      label: 'app',
      parentCaption: '/work',
    });
  });

  it('follows the Projects list as Projects are added and removed', () => {
    const registry = AtomRegistry.make();
    registry.set(projectsAtom, ['/work/app']);
    assert.strictEqual(registry.get(projectDisplayAtom('/work/app')).parentCaption, undefined);
    registry.set(projectsAtom, ['/work/app', '/other/app']);
    assert.strictEqual(registry.get(projectDisplayAtom('/work/app')).parentCaption, '/work');
    registry.set(projectsAtom, ['/work/app']);
    assert.strictEqual(registry.get(projectDisplayAtom('/work/app')).parentCaption, undefined);
  });

  it('labels a Workspace project by its file name and carries why it is unusable', () => {
    const registry = AtomRegistry.make();
    const bad = '/w/bad.code-workspace';
    registry.set(projectsAtom, ['/w/app.code-workspace', bad]);
    registry.set(workspaceFilesAtom, {
      '/w/app.code-workspace': { _tag: 'Resolved', folders: ['/a'] },
      [bad]: { _tag: 'Failed', message: 'The workspace file could not be read' },
    });
    assert.deepStrictEqual(registry.get(projectDisplayAtom('/w/app.code-workspace')), {
      error: undefined,
      label: 'app',
      parentCaption: undefined,
    });
    assert.deepStrictEqual(registry.get(projectDisplayAtom(bad)), {
      error: 'The workspace file could not be read',
      label: 'bad',
      parentCaption: undefined,
    });
  });
});

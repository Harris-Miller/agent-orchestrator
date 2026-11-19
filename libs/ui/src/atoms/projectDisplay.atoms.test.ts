import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';

import { projectDisplayAtom, projectsAtom } from './projects.atoms.ts';

describe('projectDisplayAtom', () => {
  it('shows the basename with no caption for a unique basename', () => {
    const registry = AtomRegistry.make();
    registry.set(projectsAtom, ['/work/alpha', '/work/beta']);
    assert.deepStrictEqual(registry.get(projectDisplayAtom('/work/alpha')), {
      label: 'alpha',
      parentCaption: undefined,
    });
  });

  it('shows the parent path when another Project shares the basename, case-insensitively', () => {
    const registry = AtomRegistry.make();
    registry.set(projectsAtom, ['/work/app', '/other/App']);
    assert.deepStrictEqual(registry.get(projectDisplayAtom('/work/app')), {
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
});

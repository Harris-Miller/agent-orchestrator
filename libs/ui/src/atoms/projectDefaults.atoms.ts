import { Atom } from 'effect/reactivity';

import type { ProjectDefaults } from '../host/projectResolution.ts';

/**
 * Default Additional directories by directory Project (hoa-home `projects.json`). On desktop it is hydrated with the
 * Projects; VS Code reads the file only for its Workspace cwd's entry.
 */
export const projectDefaultsAtom = Atom.make<ProjectDefaults>({}).pipe(
  Atom.withLabel('projectDefaults'),
  Atom.keepAlive,
);

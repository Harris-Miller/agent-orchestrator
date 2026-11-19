/** Names for Atoms without `Atom.withLabel`, derived from the module export they are bound to. Needs bound Atoms (load after bindHostRuntime). */
import type { Atom } from 'effect/reactivity';

import * as backendState from './backendState.atoms.ts';
import * as boundHarness from './boundHarnessAtoms.ts';
import * as developerPanelOpen from './developerPanelOpen.atoms.ts';
import * as pinnedSessions from './pinnedSessions.atoms.ts';
import * as selectedActiveSession from './selectedActiveSession.atoms.ts';
import * as sessionListScope from './sessionListScope.atoms.ts';
import * as projects from './projects.atoms.ts';
import * as virtualSession from './virtualSession.atoms.ts';
import * as workspaceFolderPaths from './workspaceFolderPaths.atoms.ts';

const modules: readonly Record<string, unknown>[] = [
  backendState,
  boundHarness,
  developerPanelOpen,
  pinnedSessions,
  selectedActiveSession,
  sessionListScope,
  projects,
  virtualSession,
  workspaceFolderPaths,
];

let names: ReadonlyMap<unknown, string> | undefined;

/** Export name of an Atom held by one of the Harness Atom modules; first export wins. */
export const exportedAtomName = (atom: Atom.Atom<unknown>): string | undefined => {
  if (names === undefined) {
    const byValue = new Map<unknown, string>();
    for (const module of modules) {
      for (const [name, value] of Object.entries(module)) {
        if (typeof value === 'object' && value !== null && !byValue.has(value)) {
          byValue.set(value, name);
        }
      }
    }
    names = byValue;
  }
  return names.get(atom);
};

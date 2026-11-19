/** Projects: one hoa-home list for all launch targets, hydrated by HarnessCacheGate. Never grown from rows or probe cwds. */
import { addProject, removeProject } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';

export const projectsAtom = Atom.make<readonly string[]>([]).pipe(Atom.withLabel('projects'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so adding and Stop tracking never overwrite it. */
export const projectsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('projectsLoaded'), Atom.keepAlive);

export const createProjectsAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  /** Adds a Project (idempotent). No-op until the file was read. */
  const addProjectAtomFn = atomRuntime
    .fn(
      Effect.fn('addProjectAtomFn')(function* (cwd: string, get: Atom.FnContext) {
        if (!get(projectsLoadedAtom)) {
          return;
        }
        const document = yield* addProject(cwd);
        get.set(projectsAtom, document.projects);
      }),
    )
    .pipe(Atom.keepAlive);

  const removeProjectAtomFn = atomRuntime
    .fn(
      Effect.fn('removeProjectAtomFn')(function* (cwd: string, get: Atom.FnContext) {
        if (!get(projectsLoadedAtom)) {
          return;
        }
        const document = yield* removeProject(cwd);
        get.set(projectsAtom, document.projects);
      }),
    )
    .pipe(Atom.keepAlive);

  return { addProjectAtomFn, removeProjectAtomFn };
};

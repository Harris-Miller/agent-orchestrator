/** Projects: one hoa-home list for all launch targets, hydrated by HarnessCacheGate. Never grown from rows or probe cwds. */
import { addProject, removeProject } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';

import { listCwdsOnUsableTargets } from './sessionLists.atoms.ts';

export const projectsAtom = Atom.make<readonly string[]>([]).pipe(Atom.withLabel('projects'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so adding and Stop tracking never overwrite it. */
export const projectsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('projectsLoaded'), Atom.keepAlive);

export const createProjectsAtoms = ({
  atomRuntime,
  hostRunFork,
}: Pick<HostRuntimeBag, 'atomRuntime' | 'hostRunFork'>) => {
  /** Adds a Project (idempotent) and lists it on every usable launch target right away. No-op until the file was read. */
  const addProjectAtomFn = atomRuntime
    .fn(
      Effect.fn('addProjectAtomFn')(function* (cwd: string, get: Atom.FnContext) {
        if (!get(projectsLoadedAtom)) {
          return;
        }
        const known = get(projectsAtom);
        const document = yield* addProject(cwd);
        get.set(projectsAtom, document.projects);
        const added = document.projects.filter(project => !known.includes(project));
        if (added.length > 0) {
          yield* listCwdsOnUsableTargets(get.registry, added, effect => {
            hostRunFork(effect);
          });
        }
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

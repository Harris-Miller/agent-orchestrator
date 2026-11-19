/** Projects: one hoa-home list for all launch targets, hydrated by `hydrateHarnessCaches`. Never grown from rows or probe cwds. */
import { addProject, ProjectsMalformed, removeProject } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { directoryBasename } from '../host/directoryBasename.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import { replaceSessionHistory } from '../host/harnessStateTransitions.ts';
import { projectParentCaption } from '../host/projectParentCaption.ts';
import { projectMembership } from '../host/projectSessions.ts';
import type { ProjectMembership } from '../host/projectSessions.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { hydrateSessionCache, removeSessionCacheCwd } from './sessionCache.ts';
import { clearListStatesOfCwd, listCwdsOnUsableTargets } from './sessionLists.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

export const projectsAtom = Atom.make<readonly string[]>([]).pipe(Atom.withLabel('projects'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so adding and Stop tracking never overwrite it. */
export const projectsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('projectsLoaded'), Atom.keepAlive);

/** How a Project is presented: its basename label, plus the parent path when another Project shares that basename. */
export const projectDisplayAtom = Atom.family((cwd: string) =>
  Atom.make(get => ({
    label: directoryBasename(cwd),
    parentCaption: projectParentCaption(cwd, get(projectsAtom)),
  })).pipe(Atom.keepAlive),
);

/** Membership of a Project: its active sessions (what Stop tracking closes) and whether Selected / the Bound Virtual belong to it. */
export const projectMembershipAtom = Atom.family((cwd: string) =>
  Atom.make((get): ProjectMembership =>
    projectMembership(
      MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
        launchTarget,
        snapshot: get(backendHarnessSnapshotAtom(launchTarget)),
      })),
      get(virtualSessionAtom),
      get(selectedAtom),
      cwd,
    ),
  ).pipe(Atom.keepAlive),
);

/**
 * Stop tracking, the data half: removes the Project and drops its rows from in-app Session History, its list states
 * and its persisted index entries. Never touches sessions on the agent or pins. No-op until the Projects file was read.
 */
export const removeProjectEverywhere = Effect.fn('removeProjectEverywhere')(function* (
  registry: AtomRegistry.AtomRegistry,
  cwd: string,
) {
  if (!registry.get(projectsLoadedAtom)) {
    return;
  }
  const document = yield* removeProject(cwd);
  registry.set(projectsAtom, document.projects);
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    updateHarnessSnapshot(registry, launchTarget, current =>
      replaceSessionHistory(
        current,
        current.sessionHistory.filter(entry => entry.cwd !== cwd),
      ),
    );
  }
  clearListStatesOfCwd(registry, cwd);
  yield* removeSessionCacheCwd(cwd);
});

export const createProjectsAtoms = ({
  atomRuntime,
  hostRunFork,
}: Pick<HostRuntimeBag, 'atomRuntime' | 'hostRunFork'>) => {
  /** Adds a Project (idempotent) and lists it on every usable launch target right away. No-op until the file was read. */
  const addProjectAtomFn = atomRuntime
    .fn(
      Effect.fn('addProjectAtomFn')(function* (cwd: string, get: Atom.FnContext) {
        if (!get(projectsLoadedAtom)) {
          return yield* new ProjectsMalformed({
            message: 'Projects file could not be read; fix or remove projects.json to add Projects.',
          });
        }
        const known = get(projectsAtom);
        const document = yield* addProject(cwd);
        get.set(projectsAtom, document.projects);
        const added = document.projects.filter(project => !known.includes(project));
        if (added.length > 0) {
          yield* Effect.forEach(
            MOUNTED_AGENT_LAUNCH_TARGETS,
            launchTarget => hydrateSessionCache(get.registry, launchTarget, added),
            { discard: true },
          );
          yield* listCwdsOnUsableTargets(get.registry, added, effect => {
            hostRunFork(effect);
          });
        }
      }),
    )
    .pipe(Atom.keepAlive);

  return { addProjectAtomFn };
};

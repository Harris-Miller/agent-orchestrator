/** Projects: one hoa-home list for all launch targets, hydrated by HarnessCacheGate. Never grown from rows or probe cwds. */
import { addProject, readSessionIndex, removeProject, removeSessionIndexCwds, sessionIndexRows } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { markHistoryUnavailable, replaceSessionHistory } from '../host/harnessStateTransitions.ts';
import { activeSessionsInCwd } from '../host/projectSessions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { clearListStatesOfCwd, listCwdsOnUsableTargets } from './sessionLists.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

export const projectsAtom = Atom.make<readonly string[]>([]).pipe(Atom.withLabel('projects'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so adding and Stop tracking never overwrite it. */
export const projectsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('projectsLoaded'), Atom.keepAlive);

export type ProjectActiveSession = {
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

/** Active sessions (loaded on an agent, incl. the Bound Virtual session) in a Project: what Stop tracking would close. */
export const projectActiveSessionsAtom = Atom.family((cwd: string) =>
  Atom.make((get): readonly ProjectActiveSession[] => {
    const virtual = get(virtualSessionAtom);
    return MOUNTED_AGENT_LAUNCH_TARGETS.flatMap(launchTarget =>
      activeSessionsInCwd(
        get(backendHarnessSnapshotAtom(launchTarget)),
        cwd,
        virtual?.launchTarget === launchTarget && virtual.sessionId !== undefined
          ? { cwd: virtual.cwd, sessionId: virtual.sessionId }
          : undefined,
      ).map(sessionId => ({ launchTarget, sessionId })),
    );
  }).pipe(Atom.keepAlive),
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
  yield* Effect.forEach(
    MOUNTED_AGENT_LAUNCH_TARGETS,
    launchTarget =>
      removeSessionIndexCwds(toLaunchTarget(launchTarget), [cwd]).pipe(
        Effect.catchCause(cause => Effect.logWarning('session index cleanup failed', launchTarget, cause)),
      ),
    { discard: true },
  );
});

/** Hydrates cached `session-index.json` rows of newly added Projects as unavailable rows (like startup hydration). */
export const hydrateCachedRows = (registry: AtomRegistry.AtomRegistry, cwds: readonly string[]) =>
  Effect.forEach(
    MOUNTED_AGENT_LAUNCH_TARGETS,
    launchTarget =>
      readSessionIndex(toLaunchTarget(launchTarget)).pipe(
        Effect.flatMap(document =>
          Effect.sync(() => {
            const cached = markHistoryUnavailable(sessionIndexRows(document, new Set(cwds)));
            updateHarnessSnapshot(registry, launchTarget, current => {
              const present = new Set(current.sessionHistory.map(entry => entry.sessionId));
              return replaceSessionHistory(current, [
                ...current.sessionHistory,
                ...cached.filter(entry => !present.has(entry.sessionId)),
              ]);
            });
          }),
        ),
        Effect.catchCause(cause => Effect.logWarning('session index hydrate failed', launchTarget, cause)),
      ),
    { discard: true },
  );

export const createProjectsAtoms = ({
  atomRuntime,
  hostRunFork,
}: Pick<HostRuntimeBag, 'atomRuntime' | 'hostRunFork'>) => {
  /** Adds a Project (idempotent) and lists it on every usable launch target right away. No-op until the file was read. */
  const addProjectAtomFn = atomRuntime
    .fn(
      Effect.fn('addProjectAtomFn')(function* (cwd: string, get: Atom.FnContext) {
        if (!get(projectsLoadedAtom)) {
          return yield* Effect.fail(
            new Error('Projects file could not be read; fix or remove projects.json to add Projects.'),
          );
        }
        const known = get(projectsAtom);
        const document = yield* addProject(cwd);
        get.set(projectsAtom, document.projects);
        const added = document.projects.filter(project => !known.includes(project));
        if (added.length > 0) {
          yield* hydrateCachedRows(get.registry, added);
          yield* listCwdsOnUsableTargets(get.registry, added, effect => {
            hostRunFork(effect);
          });
        }
      }),
    )
    .pipe(Atom.keepAlive);

  /** Removes a Project without touching its active sessions; the rail's Stop tracking closes them first. */
  const removeProjectAtomFn = atomRuntime
    .fn(
      Effect.fn('removeProjectAtomFn')(function* (cwd: string, get: Atom.FnContext) {
        yield* removeProjectEverywhere(get.registry, cwd);
      }),
    )
    .pipe(Atom.keepAlive);

  return { addProjectAtomFn, removeProjectAtomFn };
};

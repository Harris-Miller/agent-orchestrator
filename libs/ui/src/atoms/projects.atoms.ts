/** Projects: one hoa-home list for all launch targets, hydrated by `hydrateHarnessCaches`. Never grown from rows or probe cwds. */
import {
  addProject,
  normalizeProjectPath,
  projectDefaultsOf,
  ProjectsMalformed,
  readWorkspaceFolders,
  removeProject,
  setProjectAdditionalDirectories,
} from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import { replaceSessionHistory } from '../host/harnessStateTransitions.ts';
import { projectParentCaption } from '../host/projectParentCaption.ts';
import {
  projectDefaultsFor,
  projectKind,
  projectLabel,
  projectOfRecord,
  resolvedProjectCwds,
  resolveProject,
} from '../host/projectResolution.ts';
import { normalizeSessionDirectories } from '../host/sessionDirectories.ts';
import { projectMembership } from '../host/projectSessions.ts';
import type { ProjectMembership } from '../host/projectSessions.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { projectAdded, projectDirectoriesChanged } from '../analytics/catalog.ts';
import { captureEvent, trackEvent } from '../analytics/trackEvent.ts';
import { hydrateTrackedSessions } from './trackedSessions.ts';
import { isChildIn, subagentLinksAtom } from './spawnedSubagent/links.ts';
import { projectDefaultsAtom } from './projectDefaults.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';
import {
  refreshWorkspaceProject,
  resolveProjectIn,
  setWorkspaceFileState,
  workspaceFilesAtom,
} from './workspaceFiles.atoms.ts';

export const projectsAtom = Atom.make<readonly string[]>([]).pipe(Atom.withLabel('projects'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so adding and Stop tracking never overwrite it. */
export const projectsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('projectsLoaded'), Atom.keepAlive);

/**
 * How a Project is presented: its label (a Workspace file's name without extension, else the directory's basename), the
 * parent path when another Project shares that label, and the reason a Workspace project cannot be used (`error`).
 */
export const projectDisplayAtom = Atom.family((project: string) =>
  Atom.make(get => {
    const resolution = resolveProject(project, get(workspaceFilesAtom), get(projectDefaultsAtom));
    return {
      error: resolution._tag === 'Error' ? resolution.message : undefined,
      label: projectLabel(project),
      parentCaption: projectParentCaption(project, get(projectsAtom)),
    };
  }).pipe(Atom.keepAlive),
);

/** Membership of a Project: its active sessions (what Stop tracking closes) and whether Selected / the Bound Virtual belong to it. */
export const projectMembershipAtom = Atom.family((project: string) =>
  Atom.make((get): ProjectMembership => {
    const links = get(subagentLinksAtom);
    return projectMembership(
      MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
        launchTarget,
        snapshot: get(backendHarnessSnapshotAtom(launchTarget)),
      })),
      get(virtualSessionAtom),
      get(selectedAtom),
      project,
      session => isChildIn(links, session),
      get(projectsAtom),
    );
  }).pipe(Atom.keepAlive),
);

/**
 * Stop tracking, the data half: removes the Project and drops its rows from in-app Session History. Its Tracked sessions
 * stay dormant in the file until the Project is added again. Never touches sessions on the agent or pins. No-op until the
 * Projects file was read.
 */
export const removeProjectEverywhere = Effect.fn('removeProjectEverywhere')(function* (
  registry: AtomRegistry.AtomRegistry,
  project: string,
) {
  if (!registry.get(projectsLoadedAtom)) {
    return;
  }
  // Rows leave by the membership the Project had before it was removed: another Project at the same cwd keeps its own.
  const before = registry.get(projectsAtom);
  const document = yield* removeProject(project);
  registry.set(projectsAtom, document.projects);
  registry.set(projectDefaultsAtom, projectDefaultsOf(document));
  const { [project]: _removed, ...remainingStates } = registry.get(workspaceFilesAtom);
  registry.set(workspaceFilesAtom, remainingStates);
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    updateHarnessSnapshot(registry, launchTarget, current =>
      replaceSessionHistory(
        current,
        current.sessionHistory.filter(entry => projectOfRecord(entry, before) !== project),
      ),
    );
  }
});

/** What adding a Project did: whether it was new, and its kind (the telemetry property). */
export type ProjectAddResult = { readonly added: boolean; readonly kind: 'directory' | 'workspace_file' };

/**
 * Adds a Project (idempotent) and hydrates its Tracked sessions. Fails until the file was read. A Workspace file is read
 * first: when it has no usable `file:` folder the add fails with that reason and adds nothing.
 */
export const addProjectToApp = Effect.fn('addProjectToApp')(function* (
  registry: AtomRegistry.AtomRegistry,
  project: string,
) {
  if (!registry.get(projectsLoadedAtom)) {
    return yield* new ProjectsMalformed({
      message: 'Projects file could not be read; fix or remove projects.json to add Projects.',
    });
  }
  const kind = projectKind(project);
  if (kind === 'workspace_file') {
    const folders = yield* readWorkspaceFolders(project);
    setWorkspaceFileState(registry, project, { _tag: 'Resolved', folders });
  }
  const known = registry.get(projectsAtom);
  const document = yield* addProject(project);
  registry.set(projectsAtom, document.projects);
  const added = document.projects.filter(item => !known.includes(item));
  // An already-added Workspace project is re-read above, so its sessions hydrate again (rows in memory win).
  const toHydrate = resolvedProjectCwds(
    kind === 'workspace_file' ? [...new Set([...added, project])] : added,
    registry.get(workspaceFilesAtom),
  );
  if (toHydrate.length > 0) {
    yield* Effect.forEach(
      MOUNTED_AGENT_LAUNCH_TARGETS,
      launchTarget => hydrateTrackedSessions(registry, launchTarget, toHydrate),
      { discard: true },
    );
  }
  return { added: added.length > 0, kind } satisfies ProjectAddResult;
});

/**
 * Re-pick for a Workspace project (typically errored): adds `to` as a Project, moves the sessions stamped with `from` onto
 * it (the stamp is the Project's identity, so they would otherwise vanish with `from`), then removes `from`.
 */
export const repickProject = Effect.fn('repickProject')(function* (
  registry: AtomRegistry.AtomRegistry,
  from: string,
  to: string,
) {
  yield* addProjectToApp(registry, to);
  const target = resolveProjectIn(registry, to);
  const stamp = normalizeSessionDirectories({
    additionalDirectories: target._tag === 'Ready' ? target.additionalDirectories : undefined,
    workspaceFile: to,
  });
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    updateHarnessSnapshot(registry, launchTarget, current => ({
      ...replaceSessionHistory(
        current,
        current.sessionHistory.map(entry => (entry.workspaceFile === from ? { ...entry, ...stamp } : entry)),
      ),
      sessions: Object.fromEntries(
        Object.entries(current.sessions).map(([id, session]) => [
          id,
          session.workspaceFile === from ? { ...session, workspaceFile: to } : session,
        ]),
      ),
    }));
  }
  yield* removeProjectEverywhere(registry, from);
});

/**
 * Sets (or clears, with an empty list) a directory Project's default Additional directories. Only new sessions read them:
 * Tracked sessions keep the list they were created with. Fails until the Projects file was read.
 */
export const setProjectDirectories = Effect.fn('setProjectDirectories')(function* (
  registry: AtomRegistry.AtomRegistry,
  project: string,
  directories: readonly string[],
) {
  if (!registry.get(projectsLoadedAtom)) {
    return yield* new ProjectsMalformed({
      message: 'Projects file could not be read; fix or remove projects.json to change Projects.',
    });
  }
  const before = registry.get(projectDefaultsAtom);
  const document = yield* setProjectAdditionalDirectories(project, directories);
  const after = projectDefaultsOf(document);
  registry.set(projectDefaultsAtom, after);
  const key = normalizeProjectPath(project);
  const stored = projectDefaultsFor(after, key);
  return { changed: stored.join('\n') !== projectDefaultsFor(before, key).join('\n'), count: stored.length };
});

export const createProjectsAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  /** Adds a Project: {@link addProjectToApp} under its root span, with the `project_added` event when it was new. */
  const addProjectAtomFn = atomRuntime
    .fn((project: string, get: Atom.FnContext) =>
      addProjectToApp(get.registry, project).pipe(
        trackEvent<ProjectAddResult>(projectAdded(projectKind(project)), result => result.added),
        Effect.withSpan('addProjectAtomFn', { root: true }),
      ),
    )
    .pipe(Atom.keepAlive);

  /** Re-reads a Workspace project's file (the errored state's "Reload"); sessions hydrate once it is usable. */
  const reloadProjectAtomFn = atomRuntime
    .fn((project: string, get: Atom.FnContext) => refreshWorkspaceProject(get.registry, project))
    .pipe(Atom.keepAlive);

  const repickProjectAtomFn = atomRuntime
    .fn((arg: { readonly from: string; readonly to: string }, get: Atom.FnContext) =>
      repickProject(get.registry, arg.from, arg.to).pipe(Effect.withSpan('repickProjectAtomFn', { root: true })),
    )
    .pipe(Atom.keepAlive);

  const setProjectDirectoriesAtomFn = atomRuntime
    .fn((arg: { readonly directories: readonly string[]; readonly project: string }, get: Atom.FnContext) =>
      setProjectDirectories(get.registry, arg.project, arg.directories).pipe(
        // Only a real change counts: a no-op (not a Project, a Workspace file, same list) records nothing.
        Effect.tap(({ changed, count }) => (changed ? captureEvent(projectDirectoriesChanged(count)) : Effect.void)),
        Effect.asVoid,
        Effect.withSpan('setProjectDirectoriesAtomFn', { root: true }),
      ),
    )
    .pipe(Atom.keepAlive);

  return { addProjectAtomFn, reloadProjectAtomFn, repickProjectAtomFn, setProjectDirectoriesAtomFn };
};

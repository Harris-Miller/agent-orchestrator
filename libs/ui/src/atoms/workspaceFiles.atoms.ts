/**
 * What reading each Workspace project's file gave (see `host/projectResolution.ts`): written at startup hydration and
 * when a Workspace project is added or re-read; read by everything that resolves a Project to a Session cwd.
 */
import { isWorkspaceFilePath, readWorkspaceFolders } from '@lib/hoa-home';
import { Effect, Redacted, Schema } from 'effect';
import type { FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import { resolveProject } from '../host/projectResolution.ts';
import type { ProjectResolution, WorkspaceFileState, WorkspaceFileStates } from '../host/projectResolution.ts';

import { hydrateTrackedSessions } from './trackedSessions.ts';

export const workspaceFilesAtom = Atom.make<WorkspaceFileStates>({}).pipe(
  Atom.withLabel('workspaceFiles'),
  Atom.keepAlive,
);

/** A Project could not be used as a Session cwd: its Workspace file is unresolvable (or not read yet). */
export class ProjectUnresolved extends Schema.TaggedError<ProjectUnresolved>()('ProjectUnresolved', {
  message: Schema.String,
}) {}

/** Reads one Workspace file into its state. Never fails: a failure is the `Failed` state, logged without the path. */
export const readWorkspaceFileState = Effect.fn('readWorkspaceFileState')(function* (workspaceFile: string) {
  return yield* readWorkspaceFolders(workspaceFile).pipe(
    Effect.map((folders): WorkspaceFileState => ({ _tag: 'Resolved', folders })),
    Effect.catchTag('WorkspaceFileUnresolvable', error =>
      Effect.logWarning('workspace file unresolvable', error.reason).pipe(
        Effect.annotateLogs({ workspaceFile: Redacted.make(workspaceFile) }),
        Effect.as<WorkspaceFileState>({ _tag: 'Failed', message: error.message }),
      ),
    ),
  );
});

export const setWorkspaceFileState = (
  registry: AtomRegistry.AtomRegistry,
  workspaceFile: string,
  state: WorkspaceFileState,
): void => {
  registry.set(workspaceFilesAtom, { ...registry.get(workspaceFilesAtom), [workspaceFile]: state });
};

/** (Re)reads every Workspace file among `projects` concurrently and stores the states. */
export const loadWorkspaceFileStates = (
  registry: AtomRegistry.AtomRegistry,
  projects: readonly string[],
): Effect.Effect<void, never, FileSystem | Path> =>
  Effect.forEach(
    projects.filter(isWorkspaceFilePath),
    workspaceFile =>
      Effect.flatMap(readWorkspaceFileState(workspaceFile), state =>
        Effect.sync(() => {
          setWorkspaceFileState(registry, workspaceFile, state);
        }),
      ),
    { concurrency: 'unbounded', discard: true },
  );

/** `project` resolved against the stored states. */
export const resolveProjectIn = (registry: AtomRegistry.AtomRegistry, project: string): ProjectResolution =>
  resolveProject(project, registry.get(workspaceFilesAtom));

/**
 * Re-reads a Workspace project's file, so a session created or imported now sees the file's current folders and an errored
 * Project the user fixed comes back. When it becomes usable (it was not ready before), its Tracked sessions hydrate.
 * A directory Project is a no-op. Never fails.
 */
export const refreshWorkspaceProject = Effect.fn('refreshWorkspaceProject')(function* (
  registry: AtomRegistry.AtomRegistry,
  project: string,
) {
  if (!isWorkspaceFilePath(project)) return;
  const wasReady = resolveProjectIn(registry, project)._tag === 'Ready';
  setWorkspaceFileState(registry, project, yield* readWorkspaceFileState(project));
  const now = resolveProjectIn(registry, project);
  if (!wasReady && now._tag === 'Ready') {
    yield* Effect.forEach(
      MOUNTED_AGENT_LAUNCH_TARGETS,
      launchTarget => hydrateTrackedSessions(registry, launchTarget, [now.cwd]),
      { discard: true },
    );
  }
});

/** The ready resolution of `project`, or a {@link ProjectUnresolved} failure naming why it cannot start a session. */
export const requireProjectReady = Effect.fn('requireProjectReady')(function* (
  registry: AtomRegistry.AtomRegistry,
  project: string,
) {
  const resolution = resolveProjectIn(registry, project);
  if (resolution._tag === 'Ready') return resolution;
  return yield* new ProjectUnresolved({
    message: resolution._tag === 'Error' ? resolution.message : 'The workspace file has not been read yet',
  });
});

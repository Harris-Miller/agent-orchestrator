/** Startup hydration: Projects, then per launch target the tracked sessions, pins and config option index. */
import { annotateLaunchTargetLogs } from '../host/sessionTelemetry.ts';
import type { HostServices } from '@lib/context-services';
import { readConfigOptionIndexCache, readPinnedSessions, readProjects, readWorkstreams } from '@lib/hoa-home';
import { Effect, Option } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import { scopeReadsProjects } from '../host/sessionListScope.ts';

import { configOptionIndexAtom } from './backendState.atoms.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from './pinnedSessions.atoms.ts';
import { projectDefaultsAtom } from './projectDefaults.atoms.ts';
import { projectsAtom, projectsLoadedAtom } from './projects.atoms.ts';
import {
  hydrateTrackedSessions,
  resetTrackedSessionWrites,
  startTrackedSessionsPersistence,
} from './trackedSessions.ts';
import { startTrackedSessionsWatch } from './trackedSessionsWatch.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { loadWorkspaceFileStates } from './workspaceFiles.atoms.ts';
import { setWorkspaceDefaults } from './virtualSession.atoms.ts';
import { workstreamsAtom, workstreamsLoadedAtom } from './workstreams.atoms.ts';

/** Runs a read; on success applies it, on failure logs a warning with `message` and carries on. */
const hydrateOrWarn = <A, E, R>(message: string, read: Effect.Effect<A, E, R>, apply: (value: A) => void) =>
  read.pipe(
    Effect.matchCauseEffect({
      onFailure: cause => Effect.logWarning(message, cause),
      onSuccess: value =>
        Effect.sync(() => {
          apply(value);
        }),
    }),
  );

/**
 * Hydrates Projects, then (concurrently per mounted launch target) the tracked sessions, pins and config option index,
 * and starts tracked sessions persistence for targets whose index was read. Never fails: a read failure is logged and that
 * piece stays unhydrated (Projects/pins stay "not loaded", so writes against them stay disabled). Returns one
 * unsubscribe that stops every persistence subscription started.
 */
export const hydrateHarnessCaches = (
  registry: AtomRegistry.AtomRegistry,
): Effect.Effect<() => void, never, HostServices> =>
  Effect.gen(function* () {
    const unsubscribers: (() => void)[] = [];
    // Projects first: the cwds Session History lists decide which Tracked sessions hydrate.
    // Desktop reads the Projects; VS Code (Cwd/Skip scope, set before this mounts) reads only the default directories.
    if (scopeReadsProjects(registry.get(sessionListScopeAtom))) {
      yield* hydrateOrWarn('projects hydrate failed', readProjects(), ({ additionalDirectories, projects }) => {
        registry.set(projectsAtom, projects);
        registry.set(projectDefaultsAtom, additionalDirectories ?? {});
        registry.set(projectsLoadedAtom, true);
      }).pipe(Effect.catchCause(cause => Effect.logWarning('projects hydrate crashed', cause)));
      // Workspace projects resolve before the listed cwds are read; an unresolvable file lists no cwd (its rows stay dormant).
      yield* loadWorkspaceFileStates(registry, registry.get(projectsAtom)).pipe(
        Effect.catchCause(cause => Effect.logWarning('workspace files hydrate crashed', cause)),
      );
    } else {
      // The default Additional directories of the Workspace cwd's Project.
      yield* readProjects().pipe(
        Effect.flatMap(({ additionalDirectories }) => setWorkspaceDefaults(registry, additionalDirectories ?? {})),
        Effect.catchCause(cause => Effect.logWarning('project defaults hydrate failed', cause)),
      );
    }
    // Workstreams are a desktop feature too; the file is shared by all launch targets.
    if (scopeReadsProjects(registry.get(sessionListScopeAtom))) {
      yield* hydrateOrWarn('workstreams hydrate failed', readWorkstreams(), ({ workstreams }) => {
        registry.set(workstreamsAtom, workstreams);
        registry.set(workstreamsLoadedAtom, true);
      }).pipe(Effect.catchCause(cause => Effect.logWarning('workstreams hydrate crashed', cause)));
    }
    const listedCwds = () => registry.get(listedCwdsAtom);
    yield* Effect.forEach(
      MOUNTED_AGENT_LAUNCH_TARGETS,
      launchTarget =>
        Effect.gen(function* () {
          const target = toLaunchTarget(launchTarget);
          resetTrackedSessionWrites(launchTarget);
          // Only the cwds this host lists hydrate; other cwds' records stay in the file untouched.
          if (yield* hydrateTrackedSessions(registry, launchTarget, listedCwds())) {
            unsubscribers.push(yield* startTrackedSessionsPersistence(registry, launchTarget));
            unsubscribers.push(yield* startTrackedSessionsWatch(registry, launchTarget));
          }
          yield* hydrateOrWarn(
            `pinned sessions hydrate failed for ${launchTarget}`,
            readPinnedSessions(target),
            ({ pinned }) => {
              registry.set(pinnedSessionsAtom(launchTarget), pinned);
              registry.set(pinsLoadedAtom(launchTarget), true);
            },
          );
          yield* hydrateOrWarn(
            `config index hydrate failed for ${launchTarget}`,
            readConfigOptionIndexCache(target),
            config => {
              if (Option.isSome(config)) registry.set(configOptionIndexAtom(launchTarget), config.value);
            },
          );
        }).pipe(
          Effect.catchCause(cause =>
            Effect.logWarning('launch target hydrate failed', cause).pipe(annotateLaunchTargetLogs(launchTarget)),
          ),
        ),
      { concurrency: 'unbounded', discard: true },
    );
    return () => {
      unsubscribers.forEach(unsubscribe => {
        unsubscribe();
      });
    };
  });

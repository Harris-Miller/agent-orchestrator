/** Startup hydration: Projects, then per launch target the session cache, pins and config option index. */
import { readConfigOptionIndexCache, readPinnedSessions, readProjects } from '@lib/hoa-home';
import { Effect, Option } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { HostServices } from '@lib/context-services';
import { scopeReadsProjects } from '../host/sessionListScope.ts';

import { configOptionIndexAtom } from './backendState.atoms.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from './pinnedSessions.atoms.ts';
import { projectsAtom, projectsLoadedAtom } from './projects.atoms.ts';
import { hydrateSessionCache, startSessionCachePersistence } from './sessionCache.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';

/** Runs a read; on success applies it, on failure logs a warning with `label` and carries on. */
const attempt = <A, E, R>(label: readonly unknown[], read: Effect.Effect<A, E, R>, apply: (value: A) => void) =>
  read.pipe(
    Effect.matchCauseEffect({
      onFailure: cause => Effect.logWarning(...label, cause),
      onSuccess: value =>
        Effect.sync(() => {
          apply(value);
        }),
    }),
  );

/**
 * Hydrates Projects, then (concurrently per mounted launch target) the session cache, pins and config option index,
 * and starts session cache persistence for targets whose index was read. Never fails: a read failure is logged and that
 * piece stays unhydrated (Projects/pins stay "not loaded", so writes against them stay disabled). Returns one
 * unsubscribe that stops every persistence subscription started.
 */
export const hydrateHarnessCaches = (
  registry: AtomRegistry.AtomRegistry,
): Effect.Effect<() => void, never, HostServices> =>
  Effect.gen(function* () {
    const unsubscribers: (() => void)[] = [];
    // Projects first: the cwds Session History lists decide which cached rows hydrate and which the index rewrites.
    // The Projects file is desktop-only: VS Code (Cwd/Skip scope, set before this mounts) never reads it.
    if (scopeReadsProjects(registry.get(sessionListScopeAtom))) {
      yield* attempt(['projects hydrate failed'], readProjects(), ({ projects }) => {
        registry.set(projectsAtom, projects);
        registry.set(projectsLoadedAtom, true);
      });
    }
    const listedCwds = () => registry.get(listedCwdsAtom);
    yield* Effect.forEach(
      MOUNTED_AGENT_LAUNCH_TARGETS,
      launchTarget =>
        Effect.gen(function* () {
          const target = toLaunchTarget(launchTarget);
          // Only the cwds this host lists hydrate; other cwds' entries stay in the file untouched.
          if (yield* hydrateSessionCache(registry, launchTarget, listedCwds())) {
            unsubscribers.push(yield* startSessionCachePersistence(registry, launchTarget, listedCwds));
          }
          yield* attempt(['pinned sessions hydrate failed', launchTarget], readPinnedSessions(target), ({ pinned }) => {
            registry.set(pinnedSessionsAtom(launchTarget), pinned);
            registry.set(pinsLoadedAtom(launchTarget), true);
          });
          yield* attempt(['config index hydrate failed', launchTarget], readConfigOptionIndexCache(target), config => {
            if (Option.isSome(config)) registry.set(configOptionIndexAtom(launchTarget), config.value);
          });
        }).pipe(Effect.catchCause(cause => Effect.logWarning('launch target hydrate failed', launchTarget, cause))),
      { concurrency: 'unbounded', discard: true },
    );
    return () => {
      unsubscribers.forEach(unsubscribe => {
        unsubscribe();
      });
    };
  });

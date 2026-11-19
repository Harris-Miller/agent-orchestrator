import { RegistryContext } from '@effect/atom-react';
import { readConfigOptionIndexCache, readPinnedSessions, readProjects } from '@lib/hoa-home';
import { Effect, Exit, Option } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { CircularProgress, Stack, Typography } from '@mui/material';

import { configOptionIndexAtom } from '../atoms/backendState.atoms.ts';
import { listedCwdsAtom } from '../atoms/listedCwds.atoms.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from '../atoms/pinnedSessions.atoms.ts';
import { projectsAtom, projectsLoadedAtom } from '../atoms/projects.atoms.ts';
import { hydrateSessionCache, startSessionCachePersistence } from '../atoms/sessionCache.ts';
import { sessionListScopeAtom } from '../atoms/sessionListScope.atoms.ts';
import { scopeReadsProjects } from '../host/sessionListScope.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import { hostRuntime } from '../hostRuntime.ts';

export const HarnessCacheGate: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const registry = useContext(RegistryContext);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const unsubscribers: (() => void)[] = [];
    hostRuntime
      .runPromise(
        Effect.gen(function* () {
          // Projects first: the cwds Session History lists decide which cached rows hydrate and which the index rewrites.
          // The Projects file is desktop-only: VS Code (Cwd/Skip scope, set before this mounts) never reads it.
          if (scopeReadsProjects(registry.get(sessionListScopeAtom))) {
            const projectsRead = yield* Effect.exit(readProjects());
            if (Exit.isSuccess(projectsRead)) {
              registry.set(projectsAtom, projectsRead.value.projects);
              registry.set(projectsLoadedAtom, true);
            } else {
              yield* Effect.logWarning('projects hydrate failed', projectsRead.cause);
            }
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
                const pinsRead = yield* Effect.exit(readPinnedSessions(target));
                if (Exit.isSuccess(pinsRead)) {
                  registry.set(pinnedSessionsAtom(launchTarget), pinsRead.value.pinned);
                  registry.set(pinsLoadedAtom(launchTarget), true);
                } else {
                  yield* Effect.logWarning('pinned sessions hydrate failed', launchTarget, pinsRead.cause);
                }
                const config = yield* readConfigOptionIndexCache(target).pipe(
                  Effect.catchTag('PlatformError', error =>
                    Effect.as(Effect.logWarning('config index hydrate failed', launchTarget, error), Option.none()),
                  ),
                );
                if (Option.isSome(config)) registry.set(configOptionIndexAtom(launchTarget), config.value);
              }),
            { concurrency: 'unbounded' },
          );
        }),
      )
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      unsubscribers.forEach(unsubscribe => {
        unsubscribe();
      });
    };
  }, [registry]);
  if (ready) return children;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2 }}>
      <CircularProgress size={18} />
      <Typography variant="body2">Loading sessions…</Typography>
    </Stack>
  );
};

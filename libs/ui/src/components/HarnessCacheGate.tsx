import { RegistryContext } from '@effect/atom-react';
import {
  readConfigOptionIndexCache,
  readPinnedSessions,
  readProjects,
  readSessionIndex,
  sessionIndexRows,
  updateSessionIndex,
} from '@lib/hoa-home';
import { Effect, Exit, Option } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { CircularProgress, Stack, Typography } from '@mui/material';

import { backendHarnessSnapshotAtom, configOptionIndexAtom } from '../atoms/backendState.atoms.ts';
import { updateHarnessSnapshot } from '../atoms/harnessSnapshot.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from '../atoms/pinnedSessions.atoms.ts';
import { projectsAtom, projectsLoadedAtom } from '../atoms/projects.atoms.ts';
import { sessionListScopeAtom } from '../atoms/sessionListScope.atoms.ts';
import { listCwdsForScope } from '../host/sessionListScope.ts';
import { indexRowsByCwd } from '../host/sessionIndexRows.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import { markHistoryUnavailable, replaceSessionHistory } from '../host/harnessStateTransitions.ts';
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
          const projectsRead = yield* Effect.exit(readProjects());
          if (Exit.isSuccess(projectsRead)) {
            registry.set(projectsAtom, projectsRead.value.projects);
            registry.set(projectsLoadedAtom, true);
          } else {
            yield* Effect.logWarning('projects hydrate failed', projectsRead.cause);
          }
          const listedCwds = () => listCwdsForScope(registry.get(sessionListScopeAtom), registry.get(projectsAtom));
          yield* Effect.forEach(
            MOUNTED_AGENT_LAUNCH_TARGETS,
            launchTarget =>
              Effect.gen(function* () {
                const target = toLaunchTarget(launchTarget);
                const historyRead = yield* Effect.exit(readSessionIndex(target));
                const document = Exit.isSuccess(historyRead) ? historyRead.value : { cwds: {} };
                if (Exit.isFailure(historyRead)) {
                  yield* Effect.logWarning('session index hydrate failed', launchTarget, historyRead.cause);
                }
                // Only the cwds this host lists hydrate; other cwds' entries stay in the file untouched.
                updateHarnessSnapshot(registry, launchTarget, current =>
                  replaceSessionHistory(
                    current,
                    markHistoryUnavailable(sessionIndexRows(document, new Set(listedCwds()))),
                  ),
                );
                if (Exit.isSuccess(historyRead)) {
                  let writes = Promise.resolve();
                  let lastWritten = '';
                  unsubscribers.push(
                    registry.subscribe(backendHarnessSnapshotAtom(launchTarget), () => {
                      writes = writes.then(() => {
                        const current = registry.get(backendHarnessSnapshotAtom(launchTarget));
                        const rowsByCwd = indexRowsByCwd(current.sessionHistory, listedCwds());
                        const pinnedIds = new Set(
                          registry.get(pinnedSessionsAtom(launchTarget)).map(pin => pin.sessionId),
                        );
                        const nextJson = JSON.stringify([rowsByCwd, [...pinnedIds]]);
                        if (nextJson === lastWritten) return;
                        return hostRuntime
                          .runPromise(updateSessionIndex(target, rowsByCwd, pinnedIds))
                          .then(() => {
                            lastWritten = nextJson;
                          })
                          .catch((cause: unknown) =>
                            hostRuntime.runPromise(
                              Effect.logWarning('session index persist failed', launchTarget, cause),
                            ),
                          );
                      });
                    }),
                  );
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

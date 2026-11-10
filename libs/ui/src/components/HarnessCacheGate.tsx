import { RegistryContext } from '@effect/atom-react';
import {
  readConfigOptionIndexCache,
  readPinnedSessions,
  readSessionIndex,
  readTrackedCwds,
  writeSessionIndex,
} from '@lib/hoa-home';
import { Effect, Exit, Option } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { CircularProgress, Stack, Typography } from '@mui/material';

import { configOptionIndexAtom, visibleSessionHistoryAtom } from '../atoms/backendState.atoms.ts';
import { sessionHistoryAtom, updateHarnessSnapshot } from '../atoms/harnessSnapshot.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from '../atoms/pinnedSessions.atoms.ts';
import { reconcileTrackedCwds, trackedCwdsAtom, trackedCwdsLoadedAtom } from '../atoms/trackedCwds.atoms.ts';
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
        Effect.forEach(
          MOUNTED_AGENT_LAUNCH_TARGETS,
          launchTarget =>
            Effect.gen(function* () {
              const target = toLaunchTarget(launchTarget);
              const historyRead = yield* Effect.exit(readSessionIndex(target));
              const history = Exit.isSuccess(historyRead) ? historyRead.value : { sessions: [] };
              if (Exit.isFailure(historyRead)) {
                yield* Effect.logWarning('session index hydrate failed', launchTarget, historyRead.cause);
              }
              updateHarnessSnapshot(registry, launchTarget, current =>
                replaceSessionHistory(current, markHistoryUnavailable(history.sessions)),
              );
              if (Exit.isSuccess(historyRead)) {
                let writes = Promise.resolve();
                let lastWritten = JSON.stringify(historyRead.value.sessions);
                unsubscribers.push(
                  registry.subscribe(sessionHistoryAtom(launchTarget), () => {
                    writes = writes.then(() => {
                      const sessions = registry
                        .get(sessionHistoryAtom(launchTarget))
                        .map(({ unavailable: _unavailable, ...entry }) => entry);
                      const nextJson = JSON.stringify(sessions);
                      if (nextJson === lastWritten) return;
                      return hostRuntime
                        .runPromise(
                          writeSessionIndex(target, {
                            sessions,
                          }),
                        )
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
        ).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const trackedRead = yield* Effect.exit(readTrackedCwds());
              if (Exit.isFailure(trackedRead)) {
                yield* Effect.logWarning('tracked cwds hydrate failed', trackedRead.cause);
                return;
              }
              // Unmounted while reading: a late subscription would never be unsubscribed.
              if (cancelled) return;
              registry.set(trackedCwdsAtom, trackedRead.value.cwds);
              registry.set(trackedCwdsLoadedAtom, true);
              // One reconcile at a time: each reads the file and writes the whole list, so overlapping ones drop cwds.
              let reconciles = Promise.resolve();
              // Hydrated rows are visible already, so this also tracks cwds that predate the feature.
              unsubscribers.push(
                registry.subscribe(
                  visibleSessionHistoryAtom,
                  () => {
                    reconciles = reconciles.then(() =>
                      hostRuntime.runPromise(reconcileTrackedCwds(registry)).catch(() => undefined),
                    );
                  },
                  { immediate: true },
                ),
              );
            }),
          ),
        ),
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

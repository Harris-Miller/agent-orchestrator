import { RegistryContext } from '@effect/atom-react';
import { readConfigOptionIndexCache, readSessionIndex, writeSessionIndex } from '@lib/ao-home';
import type { LaunchTarget } from '@lib/ao-home';
import { Effect, Exit, Option } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { CircularProgress, Stack, Typography } from '@mui/material';

import { backendHarnessStateAtom, configOptionIndexAtom } from '../atoms/backendState.atoms.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import { markHistoryUnavailable } from '../host/harnessStateTransitions.ts';
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
              const target = launchTarget as LaunchTarget;
              const historyRead = yield* Effect.exit(readSessionIndex(target));
              const history = Exit.isSuccess(historyRead) ? historyRead.value : { sessions: [] };
              if (Exit.isFailure(historyRead)) {
                yield* Effect.logWarning('session index hydrate failed', launchTarget, historyRead.cause);
              }
              registry.update(backendHarnessStateAtom(launchTarget), current => ({
                ...current,
                sessionHistory: markHistoryUnavailable(history.sessions),
              }));
              if (Exit.isSuccess(historyRead)) {
                let writes = Promise.resolve();
                let lastWritten = JSON.stringify(historyRead.value.sessions);
                unsubscribers.push(
                  registry.subscribe(backendHarnessStateAtom(launchTarget), () => {
                    writes = writes.then(() => {
                      const current = registry.get(backendHarnessStateAtom(launchTarget));
                      const sessions = current.sessionHistory.map(({ unavailable: _unavailable, ...entry }) => entry);
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
              const config = yield* readConfigOptionIndexCache(target).pipe(
                Effect.catchTag('PlatformError', error =>
                  Effect.as(Effect.logWarning('config index hydrate failed', launchTarget, error), Option.none()),
                ),
              );
              if (Option.isSome(config)) registry.set(configOptionIndexAtom(launchTarget), config.value);
            }),
          { concurrency: 'unbounded' },
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

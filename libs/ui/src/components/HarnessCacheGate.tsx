import { RegistryContext } from '@effect/atom-react';
import { Effect } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { CircularProgress, Stack, Typography } from '@mui/material';

import { hydrateHarnessCaches } from '../atoms/harnessHydration.ts';
import { hostRuntime } from '../hostRuntime.ts';

export const HarnessCacheGate: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const registry = useContext(RegistryContext);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    hostRuntime
      .runPromise(hydrateHarnessCaches(registry))
      .then(stop => {
        if (cancelled) stop();
        else unsubscribe = stop;
      })
      .catch((error: unknown) => hostRuntime.runPromise(Effect.logWarning('harness hydrate failed', error)))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
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

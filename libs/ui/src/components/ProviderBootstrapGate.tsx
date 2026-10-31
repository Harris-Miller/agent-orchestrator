/**
 * Waits for User settings to load successfully, then seeds first-run provider defaults (once) before children mount.
 * Settings load or seed failure shows Retry and never seeds, launches, or overwrites unreadable settings.
 */
import { RegistryContext, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Cause } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useCallback, useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { seedProviderEnabledIfAbsent } from '../host/providerBootstrap.ts';
import { hostRuntime } from '../hostRuntime.ts';

type SeedPhase =
  | { readonly _tag: 'error'; readonly message: string }
  | { readonly _tag: 'ready' }
  | { readonly _tag: 'seeding' };

export const ProviderBootstrapGate: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const registry = useContext(RegistryContext);
  const settings = useAtomValue(userSettingsAtom);
  const loaded = AsyncResult.isSuccess(settings) && !settings.waiting;
  const [phase, setPhase] = useState<SeedPhase>({ _tag: 'seeding' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setPhase({ _tag: 'seeding' });
      hostRuntime
        .runPromiseExit(seedProviderEnabledIfAbsent())
        .then(exit => {
          if (cancelled) {
            return;
          }
          if (exit._tag === 'Failure') {
            setPhase({ _tag: 'error', message: Cause.pretty(exit.cause) });
            return;
          }
          if (exit.value.seeded) {
            // Keep the settings atom in step with what is now on disk.
            registry.set(userSettingsAtom, exit.value.settings);
          }
          setPhase({ _tag: 'ready' });
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, loaded, registry]);

  const retry = useCallback(() => {
    registry.refresh(userSettingsAtom);
    setAttempt(value => value + 1);
  }, [registry]);

  if (AsyncResult.isFailure(settings)) {
    return (
      <Stack spacing={1} sx={{ p: 2 }}>
        <Alert severity="error">Could not load settings: {Cause.pretty(settings.cause)}</Alert>
        <Button onClick={retry} sx={{ alignSelf: 'flex-start' }} variant="contained">
          Retry
        </Button>
      </Stack>
    );
  }
  if (phase._tag === 'error') {
    return (
      <Stack spacing={1} sx={{ p: 2 }}>
        <Alert severity="error">Could not prepare providers: {phase.message}</Alert>
        <Button onClick={retry} sx={{ alignSelf: 'flex-start' }} variant="contained">
          Retry
        </Button>
      </Stack>
    );
  }
  if (!loaded || phase._tag === 'seeding') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Preparing providers…</Typography>
      </Stack>
    );
  }
  return children;
};

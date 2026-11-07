/**
 * Waits for User settings to load successfully, then seeds first-run provider defaults (once) and the Show archived
 * mirror before children mount.
 * Settings load or seed failure shows Retry and never seeds, launches, or overwrites unreadable settings.
 */
import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { Cause, Effect } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import { useCallback, useContext, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { providerEnabledMapAtom, showArchivedAtom } from '../atoms/backendState.atoms.ts';
import { userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { showArchivedEnabled } from '../atoms/userSettings/userSettings.atoms.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import { seedProviderEnabledIfAbsent } from '../host/providerBootstrap.ts';
import { runStartupRuntimeCleanup } from '../host/providerRuntime.ts';
import { hostRuntime } from '../hostRuntime.ts';
import { GateProgress, GateRetry, useStartupTask } from './startupGateParts.tsx';

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

  useStartupTask(
    async isCancelled => {
      if (!loaded) {
        return;
      }
      setPhase({ _tag: 'seeding' });
      const exit = await hostRuntime.runPromiseExit(
        Effect.gen(function* () {
          const seeded = yield* seedProviderEnabledIfAbsent();
          // Incomplete attempts and failed deletions from a previous run; the active runtime is never touched.
          yield* runStartupRuntimeCleanup(MOUNTED_AGENT_LAUNCH_TARGETS);
          return seeded;
        }),
      );
      if (isCancelled()) {
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
      // Only now do providers mount: the enabled preference is known and first-run defaults are persisted.
      registry.set(providerEnabledMapAtom, exit.value.settings.providerEnabled);
      registry.set(showArchivedAtom, showArchivedEnabled(exit.value.settings));
      setPhase({ _tag: 'ready' });
    },
    [attempt, loaded, registry],
  );

  const retry = useCallback(() => {
    registry.refresh(userSettingsAtom);
    setAttempt(value => value + 1);
  }, [registry]);

  if (AsyncResult.isFailure(settings)) {
    return <GateRetry message={`Could not load settings: ${Cause.pretty(settings.cause)}`} onRetry={retry} />;
  }
  if (phase._tag === 'error') {
    return <GateRetry message={`Could not prepare providers: ${phase.message}`} onRetry={retry} />;
  }
  if (!loaded || phase._tag === 'seeding') {
    return <GateProgress label="Preparing providers…" />;
  }
  return children;
};

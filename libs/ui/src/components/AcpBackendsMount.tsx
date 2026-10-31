import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { useContext, useEffect } from 'react';
import type { FC } from 'react';

import { backendHarnessAtom } from '../atoms/boundHarnessAtoms.ts';
import { enabledLaunchTargetsAtom } from '../atoms/backendState.atoms.ts';

/**
 * Mounts the backend harness atom for every enabled provider (and only those). Providers start in parallel; a
 * newly enabled provider starts once, a disabled one is stopped by its Disable action, not by unmounting.
 */
export const AcpBackendsMount: FC = () => {
  const registry = useContext(RegistryContext);
  const enabledLaunchTargets = useAtomValue(enabledLaunchTargetsAtom);
  useEffect(() => {
    const unmounts = enabledLaunchTargets.map(launchTarget => registry.mount(backendHarnessAtom(launchTarget)));
    return () => {
      for (const unmount of unmounts) {
        unmount();
      }
    };
  }, [enabledLaunchTargets, registry]);
  return null;
};

import { RegistryContext } from '@effect/atom-react';
import { useContext, useEffect } from 'react';
import type { FC } from 'react';

import { backendHarnessAtom } from '../atoms/boundHarnessAtoms.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';

/** Eagerly mounts backend harness atoms for every launch target in this build. */
export const AcpBackendsMount: FC = () => {
  const registry = useContext(RegistryContext);
  useEffect(() => {
    const unmounts = MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => registry.mount(backendHarnessAtom(launchTarget)));
    return () => {
      for (const unmount of unmounts) {
        unmount();
      }
    };
  }, [registry]);
  return null;
};

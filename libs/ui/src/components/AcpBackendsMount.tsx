import { useAtomMount } from '@effect/atom-react';
import type { FC } from 'react';

import { backendHarnessAtom } from '../atoms/boundHarnessAtoms.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';

const BackendHarnessMount: FC<{ readonly launchTarget: AgentLaunchTarget }> = ({ launchTarget }) => {
  useAtomMount(backendHarnessAtom(launchTarget));
  return null;
};

export const AcpBackendsMount: FC = () => (
  <>
    {MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => (
      <BackendHarnessMount key={launchTarget} launchTarget={launchTarget} />
    ))}
  </>
);

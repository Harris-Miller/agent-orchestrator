import { useAtomSet } from '@effect/atom-react';
import { useState } from 'react';

import { cancelSubagentAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

/** Cancel a Subagent once; re-enables the action and reports the error if the cancel request fails. */
export const useCancelSubagent = (
  launchTarget: AgentLaunchTarget | undefined,
  childId: string,
  onClientError: (error: unknown) => void,
) => {
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelAtom = useAtomSet(cancelSubagentAtomFn, { mode: 'promise' });
  const cancel = () => {
    if (launchTarget === undefined) return;
    setCancelRequested(true);
    cancelAtom({ launchTarget, sessionId: childId }).catch((error: unknown) => {
      setCancelRequested(false);
      onClientError(error);
    });
  };
  return { cancel, cancelRequested };
};

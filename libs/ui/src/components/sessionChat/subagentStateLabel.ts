import { isSubagentFinished, subagentNeedsInput } from '../../host/subagent.ts';
import type { SubagentSnapshot } from '../../host/subagent.ts';

type StateLabel = { color: 'default' | 'error' | 'success' | 'warning'; label: string };

export const subagentStateLabel = (child: SubagentSnapshot): StateLabel => {
  if (subagentNeedsInput(child)) return { color: 'warning', label: 'Needs input' };
  if (child.state === undefined) {
    // A fresh spawn has not reported yet (Claude never does while working); a reset one is genuinely unconfirmed.
    return child.stateUnconfirmed === true
      ? { color: 'default', label: 'Unknown' }
      : { color: 'default', label: 'Running' };
  }
  if (isSubagentFinished(child.state)) return { color: 'success', label: 'Finished' };
  switch (child.state.state) {
    case 'running':
      return { color: 'default', label: 'Running' };
    case 'cancelled':
      return { color: 'default', label: 'Cancelled' };
    case 'failed':
      return { color: 'error', label: 'Failed' };
    default:
      return { color: 'default', label: child.state.state };
  }
};

import { isSubagentFinished, subagentNeedsInput, WORK_STATE } from '../../host/subagent.ts';
import type { SubagentSnapshot } from '../../host/subagent.ts';

export type SubagentStatus = 'cancelled' | 'failed' | 'finished' | 'needs_input' | 'running' | 'unknown';

/** Presentation bucket for a child; unknown wire strings land in `unknown` (neutral, never an error). */
export const subagentStatus = (child: SubagentSnapshot): SubagentStatus => {
  if (subagentNeedsInput(child)) return 'needs_input';
  if (child.state === undefined) {
    // A fresh spawn has not reported yet (Claude never does while working); a reset one is genuinely unconfirmed.
    return child.stateUnconfirmed === true ? 'unknown' : 'running';
  }
  if (isSubagentFinished(child.state)) return 'finished';
  switch (child.state.state) {
    case WORK_STATE.running:
      return 'running';
    case WORK_STATE.cancelled:
      return 'cancelled';
    case WORK_STATE.failed:
      return 'failed';
    default:
      return 'unknown';
  }
};

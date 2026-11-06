import { isSubagentFinished, subagentNeedsInput } from '../../host/subagent.ts';
import type { SubagentSnapshot } from '../../host/subagent.ts';

export const subagentStateLabel = (
  child: SubagentSnapshot,
): { color: 'default' | 'success' | 'warning'; label: string } => {
  if (subagentNeedsInput(child)) return { color: 'warning', label: 'Needs input' };
  if (child.state === undefined) return { color: 'default', label: 'Unknown' };
  if (isSubagentFinished(child.state)) return { color: 'success', label: 'Finished' };
  return { color: 'default', label: child.state.state === 'running' ? 'Running' : child.state.state };
};

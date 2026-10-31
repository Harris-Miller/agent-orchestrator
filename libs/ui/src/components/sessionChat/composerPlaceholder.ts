import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

export const composerPlaceholder = (launchTarget: AgentLaunchTarget | undefined, isVirtual: boolean): string => {
  if (launchTarget === undefined) {
    return isVirtual ? 'Choose an agent, then write a prompt…' : 'Select a session…';
  }
  const label = agentLaunchTargetLabel(launchTarget);
  return launchTarget === 'codex-acp'
    ? `Ask ${label} anything. @ files, $ skills, / commands`
    : `Ask ${label} anything. @ files, / commands`;
};

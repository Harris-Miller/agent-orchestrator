import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from './agentLaunchTarget.ts';

/** Header title for Virtual New Session or a history Session row. */
export const sessionChatTitle = (
  isVirtual: boolean,
  entry: { readonly title?: string } | undefined,
  launchTarget: AgentLaunchTarget | undefined,
): string => {
  if (isVirtual) {
    return 'New Session';
  }
  if (entry === undefined) {
    return 'Chat';
  }
  return entry.title ?? (launchTarget === undefined ? 'Chat' : agentLaunchTargetLabel(launchTarget));
};

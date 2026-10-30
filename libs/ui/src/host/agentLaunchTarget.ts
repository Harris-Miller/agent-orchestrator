/** Agent launch target identity: type, mounted list, and display labels. */

export type AgentLaunchTarget = 'antigravity-acp' | 'claude-agent-acp' | 'codex-acp' | 'cursor-acp';

/** Launch targets that spawn a Node ACP adapter from the adapter resource tree. */
export type AcpAdapterLaunchTarget = 'claude-agent-acp' | 'codex-acp';

export const ALL_AGENT_LAUNCH_TARGETS = [
  'codex-acp',
  'claude-agent-acp',
  'antigravity-acp',
  'cursor-acp',
] as const satisfies readonly AgentLaunchTarget[];

export const agentLaunchTargetLabel = (launchTarget: AgentLaunchTarget): string => {
  switch (launchTarget) {
    case 'antigravity-acp':
      return 'Antigravity';
    case 'claude-agent-acp':
      return 'Claude';
    case 'codex-acp':
      return 'Codex';
    case 'cursor-acp':
      return 'Cursor (beta)';
  }
};

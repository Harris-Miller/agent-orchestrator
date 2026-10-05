/** Agent launch target identity: type, mounted list, and display labels. */

export type AgentLaunchTarget = 'claude-agent-acp' | 'codex-acp' | 'gemini-acp';

export const ALL_AGENT_LAUNCH_TARGETS = [
  'codex-acp',
  'claude-agent-acp',
  'gemini-acp',
] as const satisfies readonly AgentLaunchTarget[];

export const agentLaunchTargetLabel = (launchTarget: AgentLaunchTarget): string => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return 'Claude';
    case 'codex-acp':
      return 'Codex';
    case 'gemini-acp':
      return 'Gemini (beta)';
  }
};

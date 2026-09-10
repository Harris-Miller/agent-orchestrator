/** Agent launch target identity: type, mounted list, and display labels. */

export type AgentLaunchTarget = 'claude-agent-acp' | 'codex-acp' | 'gemini-cli';

export const ALL_AGENT_LAUNCH_TARGETS = [
  'codex-acp',
  'claude-agent-acp',
  // 'gemini-cli',
] as const satisfies readonly AgentLaunchTarget[];

export const agentLaunchTargetLabel = (backend: AgentLaunchTarget): string => {
  switch (backend) {
    case 'claude-agent-acp':
      return 'Claude';
    case 'codex-acp':
      return 'Codex';
    case 'gemini-cli':
      return 'Gemini';
  }
};

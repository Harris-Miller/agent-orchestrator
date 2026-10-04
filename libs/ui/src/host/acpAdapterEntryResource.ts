/** Relative paths into the shared `acp-adapter-resources` tree (desktop + VS Code). */

export const ACP_ADAPTER_ENTRY_RESOURCE = {
  'claude-agent-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
  'codex-acp': 'acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
  'gemini-acp': 'acp-adapter-resources/node_modules/@lib/gemini-acp/dist/index.js',
} as const;

export type AcpAdapterLaunchTarget = keyof typeof ACP_ADAPTER_ENTRY_RESOURCE;

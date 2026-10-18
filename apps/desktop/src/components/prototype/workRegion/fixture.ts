/**
 * PROTOTYPE fixture — MCP-servers turn from ChatGPT/Codex screenshots.
 * Question: what should the collapsible work region between user + agent look like?
 */

export type WorkStep = {
  readonly detail?: string;
  readonly id: string;
  readonly kind: 'group' | 'read' | 'search' | 'shell' | 'tool';
  readonly title: string;
};

export type WorkTurnFixture = {
  readonly agentAnswerMarkdown: string;
  readonly durationLabel: string;
  readonly intent: string;
  readonly steps: readonly WorkStep[];
  readonly userPrompt: string;
};

export const MCP_WORK_TURN: WorkTurnFixture = {
  agentAnswerMarkdown: `**exposed MCP servers** (this chat)

- \`chrome-devtools\`
- \`context7\`
- \`node_repl\`

**Global Codex config** (\`~/.codex/config.toml\`)

- enabled: \`chrome-devtools\`, \`context7\`, \`node_repl\`
- defined but disabled: \`computer-use\`

**Repo config** (\`.cursor/mcp.json\`)

- \`tauri\`, \`grafana\`, \`tempo\`, \`chrome-devtools\`

Repo servers are Cursor configuration. They are not automatically active in this Codex chat.`,
  durationLabel: 'Worked for 14s',
  intent:
    "I'll inspect the repo and global MCP configuration, then separate servers defined by this repository from globally configured ones. I'm also applying the required brief/caveman and minimal-solution guidance.",
  steps: [
    {
      id: 'group-1',
      kind: 'group',
      title: 'Used Codex integration, loaded tools, read files, ran commands',
    },
    { id: 'read-caveman', kind: 'read', title: 'Read Caveman skill' },
    { id: 'read-ponytail', kind: 'read', title: 'Read Ponytail skill' },
    {
      detail: `$ printf '%s\\n' '--- repo ---'; rg --files -g '*mcp*' …
/Users/harris/.codex/archived_sessions/…
/Users/harris/.codex/config.toml
/Users/harris/.codex/sessions/…`,
      id: 'shell-1',
      kind: 'shell',
      title: "Ran printf '%s\\n' '--- repo ---'; rg --files…",
    },
    {
      detail: `$ printf '%s\\n' '--- ~/.codex/config.toml ---'; sed -n '1,240p' ~/.codex/config.toml
[mcp_servers.chrome-devtools]
enabled = true
…`,
      id: 'shell-2',
      kind: 'shell',
      title: 'Ran printf … ~/.codex/config.toml',
    },
    { id: 'read-mcp', kind: 'read', title: 'Read `mcp.json`' },
    { id: 'list-files', kind: 'search', title: 'Listed files' },
    {
      detail: `pattern: mcp_servers|mcpServers|context7
.cursor/mcp.json
~/.codex/config.toml`,
      id: 'search-1',
      kind: 'search',
      title: 'Searched for mcp_servers|mcpServers|…',
    },
    { id: 'mcp-list', kind: 'tool', title: 'List MCP resources' },
  ],
  userPrompt: 'What mcp servers do you have available in this chat? Which as defined in repo versus global?',
};

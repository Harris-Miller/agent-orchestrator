# ACP v1 `session/new` `mcpServers`: override, collide, or add?

Date: 2026-09-09
Question: When an ACP client passes `mcpServers` on `session/new` (non-empty), do those servers replace **all** agent-local MCP config, only override on name collision, or add to the agent’s list? What happens when the client passes `[]` / omits extras?

## Summary

**ACP v1 does not define merge-vs-replace with agent-owned MCP config.** The protocol only says clients MAY list servers the agent should connect to, and agents SHOULD connect to all client-specified servers. Whether Claude Code / Codex still load their own config files is outside the protocol.

| Layer | Non-empty client `mcpServers` | Empty `mcpServers: []` |
| --- | --- | --- |
| **Protocol** | Unspecified vs agent-local config | Unspecified; empty list = client specifies nothing extra |
| **Claude** (`claude-agent-acp`) | **Additive** with agent settings (via `settingSources`); same-name collisions: ACP params override `_meta.claudeCode.options.mcpServers`; SDK programmatic servers coexist with filesystem MCP unless `strictMcpConfig` (adapter does **not** set it). Also may inject built-in SDK server `claude_agent_acp`. | Client contributes no entries; settings MCP still load |
| **Codex Rust** (`zed-industries/codex-acp`) | **Additive**: clone base `config.mcp_servers`, then `HashMap::insert` per client server → same name **client wins** | Clone unchanged → agent-local MCP kept |
| **Codex TS** (`@agentclientprotocol/codex-acp`, what this repo ships) | **Additive by default**, but collision policy differs: with default MCP filtering, **skips** client servers whose names already exist (agent wins); if filtering disabled, client names are written into a `mcp_servers` override (Codex deep-merges; client intended to win on collision). | Early-return; process/filesystem MCP unchanged |

**Verdict for this app:** Passing non-empty `mcpServers` does **not** wipe Claude/Codex agent-local MCP. It **adds** (with name-collision rules that differ by adapter). Passing `[]` (current harness) adds nothing; agents still load their own configs — matching observed behavior.

This repo currently creates/loads sessions with `{ cwd, mcpServers: [] }` (`apps/desktop/src/acp/agentHarness.ts`). Adapters are `@agentclientprotocol/claude-agent-acp` / `@agentclientprotocol/codex-acp` from `apps/desktop/acp-adapter-resources`.

## ACP v1 protocol

Primary sources:

- Session setup: https://agentclientprotocol.com/protocol/v1/session-setup.md
- Schema (`NewSessionRequest`): https://agentclientprotocol.com/protocol/v1/schema.md

### What the protocol says

From session setup (“MCP Servers”):

- Clients **MAY** include connection details for MCP servers the Agent should connect to.
- Agents **SHOULD** connect to all MCP servers specified by the Client.
- Clients MAY use this to expose tools via their own MCP server.

From schema (`NewSessionRequest.mcpServers`):

- Required field: “List of MCP (Model Context Protocol) servers the agent should connect to.”
- Agent guidance for `session/new`: “Connect to any specified MCP servers.”

### What the protocol does *not* say

- No rule that client `mcpServers` replaces, merges with, or disables agent-local MCP configuration (Claude settings / `.mcp.json`, Codex `mcp_servers` in config.toml / layers, etc.).
- No merge algorithm for duplicate `name` values between client list and agent-owned config.
- Empty array is still a valid list: the client specifies zero servers. That does not instruct the agent to clear its own MCP stack.

Agent-owned MCP loading is therefore an **adapter/runtime** concern.

## Claude — `@agentclientprotocol/claude-agent-acp`

Repos (verified against `main` @ `cc528fb`, also pinned in this repo as `0.73.0`):

- https://github.com/agentclientprotocol/claude-agent-acp
- `src/acp-agent.ts` — `createSession` / Options construction
- `src/tests/create-session-options.test.ts` — `"merges user-provided mcpServers with ACP mcpServers"`
- `src/file-change-audit.ts` — `FILE_CHANGE_AUDIT_SERVER_NAME = "claude_agent_acp"`
- Claude Agent SDK Options: `@anthropic-ai/claude-agent-sdk` `sdk.d.ts` (`strictMcpConfig`, `settingSources`, `mcpServers`)
- SDK MCP docs: https://code.claude.com/docs/en/agent-sdk/mcp

### How client `params.mcpServers` is handled

1. Convert ACP `McpServer[]` into a `Record<string, McpServerConfig>` keyed by `server.name` (stdio / http / sse).
2. Build SDK `options.mcpServers` as:

   ```ts
   mcpServers: {
     ...(userProvidedOptions?.mcpServers || {}),
     ...mcpServers, // from session/new params
     ...(fileChangeAuditSupport
       ? { [FILE_CHANGE_AUDIT_SERVER_NAME]: fileChangeAuditSupport.mcpServer }
       : {}),
   }
   ```

3. Always set `settingSources: ["user", "project", "local"]` on the SDK query options.
4. Do **not** set `strictMcpConfig`.

Adapter comments on `_meta.claudeCode.options` explicitly say `mcpServers` is “merged with ACP’s mcpServers.” The object-spread order means **ACP `session/new` entries override same-name keys from `_meta` options**. The file-change-audit SDK server (`claude_agent_acp`, via `createSdkMcpServer`) is spread last when that capability is active, so it wins that name.

Test coverage confirms both `_meta` and ACP servers appear in the captured Options when names differ.

### How that interacts with Claude-local MCP config

- With `settingSources` including `user` / `project` / `local`, filesystem Claude settings and project `.mcp.json` remain in play (SDK MCP docs: configure in code **or** `.mcp.json` loaded via `settingSources`; `.mcp.json` requires `project` when sources are set explicitly — and the adapter includes `project`).
- SDK `strictMcpConfig: true` means: use **only** `options.mcpServers` (and MCP declared on explicitly passed `agents`), ignoring project `.mcp.json`, user settings, plugins, and on-disk agent frontmatter (`sdk.d.ts`; maps to CLI `--strict-mcp-config`). The adapter never enables this, so programmatic ACP servers are **not** a full replace of Claude-local MCP.
- Programmatic servers are passed to the CLI as `--mcp-config` JSON; settings sources are passed separately as `--setting-sources=...` (SDK `sdk.mjs` spawn path). Both channels are active unless strict mode is on.

**Practical answer for Claude:** client `mcpServers` **adds** to the agent’s MCP set. Same name as a `_meta.claudeCode.options.mcpServers` entry → client/ACP wins in the Options map. Same name as a settings/`.mcp.json` server → not defined by ACP; SDK keeps both channels open without `strictMcpConfig` (do not assume wipe). Empty `[]` → no ACP entries; settings MCP still load.

## Codex

Two first-party adapters exist. This desktop harness uses the **TypeScript** npm package, not the Zed Rust binary.

### Rust — `zed-industries/codex-acp` (`src/codex_agent.rs`)

Repo: https://github.com/zed-industries/codex-acp (`main` @ `296069e` when checked)

`build_session_config(cwd, mcp_servers)`:

1. `config = self.config.clone()` (process/base Codex config, including any already-defined `mcp_servers`).
2. `let mut new_mcp_servers = config.mcp_servers.get().clone();`
3. For each client `McpServer` (HTTP / Stdio supported; SSE ignored): `new_mcp_servers.insert(name, …)` (whitespace in names → `_`).
4. `config.mcp_servers.set(new_mcp_servers)`.

`HashMap::insert` overwrites an existing key. Therefore:

- **Additive** relative to base config.
- **Same name → client wins.**
- **Empty client list → base map unchanged** (agent-local MCP remains).

### TypeScript — `@agentclientprotocol/codex-acp` (this repo)

Repo: https://github.com/agentclientprotocol/codex-acp  
Pinned here: `apps/desktop/acp-adapter-resources` → `@agentclientprotocol/codex-acp@1.8.0`  
Implementation: `src/CodexAcpClient.ts` → `createSessionConfig`

Behavior:

1. Build session config from process/gateway merge + trusted project roots.
2. If `mcpServers.length === 0`, **return that config as-is** (no `mcp_servers` override) → agent-local MCP from Codex config layers stays.
3. If non-empty:
   - Default (`DISABLE_MCP_CONFIG_FILTERING` unset/false): `shouldDeduplicateMcpConflicts()` is true → **drop** client servers whose sanitized names already appear in effective/layer `mcp_servers` (comment: prevent deep-merge of incompatible field types). Remaining names are written under `"mcp_servers"`.
   - If filtering disabled via `DISABLE_MCP_CONFIG_FILTERING=true`: all client servers are written under `"mcp_servers"` without dropping collisions.

So under default TS behavior: **additive for new names; on name collision the agent-local entry is kept and the client entry is skipped** (opposite collision winner vs Rust `insert`). Empty `[]` still means “do not touch agent MCP.”

## Comparison matrix

| Question | Protocol | Claude ACP | Codex Rust | Codex TS (repo) |
| --- | --- | --- | --- | --- |
| Replace **all** agent MCP? | Not specified | No (`settingSources` on; no `strictMcpConfig`) | No (clone then insert) | No (`[]` noop; non-empty merges/overrides map) |
| Add to list? | Client list only | Yes | Yes | Yes (new names) |
| Same name collision | Unspecified | ACP params beat `_meta` options; settings vs programmatic not ACP-specified | Client wins (`insert`) | Agent wins by default (filter); client can win if filtering disabled |
| `mcpServers: []` | Client specifies none | Settings MCP still load | Base MCP kept | Base MCP kept |

## Implications for `apps/desktop` Agent Chat

Current create/load path (`agentHarness.ts`):

```ts
agent['session/new']({ cwd, mcpServers: [] })
// …
agent['session/load']({ cwd, mcpServers: [], sessionId })
```

Consequences:

- Empty array is correct if the product wants “whatever Claude/Codex already configured locally,” and matches why MCP tools still appear with `[]`.
- If the harness later passes real `mcpServers`, expect **add**, not a full wipe — and watch **name collisions** (especially Codex TS default filtering vs Claude Options spread).
- Do not rely on ACP alone to disable agent-local MCP; that would need adapter/runtime knobs (e.g. Claude `strictMcpConfig` via `_meta.claudeCode.options`, or Codex config without local servers).

## Sources checklist

| Claim | Source |
| --- | --- |
| Clients MAY pass MCP servers; agents SHOULD connect to all specified | https://agentclientprotocol.com/protocol/v1/session-setup.md |
| `NewSessionRequest.mcpServers` wording; connect to any specified | https://agentclientprotocol.com/protocol/v1/schema.md |
| Protocol silent on agent-local merge/replace | Same two docs (no merge algorithm / replace language) |
| Claude converts `params.mcpServers`, merges with `_meta` options, sets `settingSources` | `claude-agent-acp` `src/acp-agent.ts` |
| Claude merge test (both ACP + `_meta` servers present) | `claude-agent-acp` `src/tests/create-session-options.test.ts` |
| Built-in SDK MCP name `claude_agent_acp` | `claude-agent-acp` `src/file-change-audit.ts` |
| `strictMcpConfig` ignores filesystem MCP; default is not strict | `@anthropic-ai/claude-agent-sdk` `sdk.d.ts`; https://code.claude.com/docs/en/agent-sdk/mcp |
| Codex Rust clone + `insert` | `zed-industries/codex-acp` `src/codex_agent.rs` `build_session_config` |
| Codex TS empty short-circuit + collision filtering | `agentclientprotocol/codex-acp` `src/CodexAcpClient.ts` `createSessionConfig` / `shouldDeduplicateMcpConflicts` |
| This repo passes `mcpServers: []`; adapter package pins | `apps/desktop/src/acp/agentHarness.ts`; `apps/desktop/acp-adapter-resources/package.json` |

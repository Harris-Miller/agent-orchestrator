# Handoff via an app-hosted MCP server injected into every session

Date: 2026-11-07  
Question: Can agent-orchestrator replace today's Handoff, which sends text into a session and pattern-matches the reply, with an MCP server the app hosts and injects into every session it controls? The server's tools (handoff / create session first, more later) would be called by the agent. How does T3 Code do this, what does ACP allow, and what should this repo build?

Prior art (not repeated here):

- [`2026-09-09-acp-session-new-mcp-servers.md`](./2026-09-09-acp-session-new-mcp-servers.md): client `mcpServers` **add to** the agent's own MCP config rather than replacing it, and each adapter resolves name collisions differently. That note checked `claude-agent-acp@0.73.0` / `codex-acp@1.8.0`. This one re-checks the versions installed now (`0.100.0` / `2.5.0`).
- [`2026-09-10-acp-system-prompt-injection.md`](./2026-09-10-acp-system-prompt-injection.md): how to inject per-agent system prompts.
- [`2026-10-29-orca-t3code-acp-gemini-antigravity.md`](./2026-10-29-orca-t3code-acp-gemini-antigravity.md): T3 Code's ACP providers.

Sources read in tree: this repo, `/Users/hmiller/Projects/harris-miller/t3code` (HEAD `d51bc58f5`, 2026-11-03), and installed packages under `node_modules`. Anything marked **(inference)** is not confirmed by a source.

## Summary

| Question                                 | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current Handoff                          | The user starts it from the composer menu. The app sends a fixed prompt as a normal user turn, then runs a regex over the **last `agent_message` item** looking for `<handoff>…</handoff>`. If the tags are missing it **silently uses the whole message**. It then calls `session/new` on the target and sends the document as the first prompt. Everything lives in `libs/ui`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Does T3 Code do this?                    | **Yes.** One **in-process Streamable HTTP MCP endpoint** at `/mcp` on T3's own Node server, built with Effect's `effect/ai` `McpServer.layerHttp`. Each provider session gets a **per-thread bearer token**. The token is injected as an HTTP MCP server (Claude SDK, Codex app-server, Cursor SDK, HTTP-capable ACP agents). ACP agents without HTTP get a **stdio shim** (`t3 acp-mcp-bridge`) that proxies to the HTTP endpoint, and agents that advertise `mcpCapabilities.acp` get the draft **MCP-over-ACP** transport. The token resolves to the calling thread; handlers read it from `McpInvocationContext`. The agent learns the tools from tool descriptions plus a fixed instruction block (appended to the system prompt where possible, otherwise wrapped around the first prompt on ACP). |
| ACP constraints                          | Agents **MUST** support stdio MCP servers. HTTP/SSE are optional and must be checked through `mcpCapabilities` from `initialize`. `session/load` and `session/resume` re-take `mcpServers`. MCP-over-ACP (`type: "acp"`) is a **Draft RFD**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Agents used here                         | Claude adapter `0.100.0`: `http`+`sse`. Codex adapter `2.5.0`: `http` only (rejects `sse`/`acp`). Antigravity `1.4.5`: `http`+`sse` (probed live). Cursor: **unconfirmed**; Cursor's docs only mention `.cursor/mcp.json`. None advertise `acp`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Biggest constraint specific to this repo | The ACP client and Harness run in the **WebView** on both hosts (ADR 0002, ADR 0009). A WebView cannot open a listening socket, so the app cannot simply "host an HTTP server" the way T3's Node server does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Effect MCP support                       | Installed `effect@4.0.5` includes `effect/ai` `McpServer` (`layerHttp`, `layerStdio`, `layer` over a custom `RpcServer.Protocol`), `Tool`, `Toolkit`, and MCP protocols up to `2026-07-28`. `@effect/platform-node@4.0.5` is installed. `@modelcontextprotocol/sdk@1.32.2` is present only as a transitive dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Recommendation                           | A small **Node "MCP hub" child process** that the Harness spawns through the existing `ChildProcessSpawner` (same `node` the Claude/Codex adapters already need). The hub binds `127.0.0.1:0`, serves Effect `McpServer.layerHttp` with bearer auth, and passes each tool call back to the WebView over its own stdio. Each session gets a token issued before `session/new` and bound to the `sessionId` after. Phase 1 adds one tool, `submit_handoff({ document })`, which replaces the regex and keeps the user-initiated flow. Agent-initiated `handoff` / `create_session` comes in phase 2. Agents without HTTP fall back to a stdio shim, and MCP-over-ACP becomes the target once agents ship it.                                                                                               |

---

## 1. Current Handoff in agent-orchestrator

### Flow end to end

1. **Trigger (user, not agent).** The composer's split-button menu has a "Handoff" item that opens `HandoffModal` (`libs/ui/src/components/sessionChat/SessionChatBody.tsx:736-744`). In the modal the user picks the target launch target and its config options (`libs/ui/src/components/sessionChat/HandoffModal.tsx:28-130`). Confirm calls `handoffSession({ configValues, sourceLaunchTarget, sourceSessionId, targetLaunchTarget })` (`SessionChatBody.tsx:761-777`).
2. **Atom fn.** `handoffSessionAtomFn` (`libs/ui/src/atoms/handoff.atoms.ts:56-159`, wired at `libs/ui/src/atoms/boundHarnessAtoms.ts:100`):
   - sets `handoffInProgressAtom`, which locks out Send but not Steering or Cancel (`handoff.atoms.ts:29,73`; `libs/ui/src/host/composerAction.ts:90-112`);
   - looks up the source cwd in Session History (`handoff.atoms.ts:83-88`);
   - **injects text.** It sends `SOURCE_HANDOFF_PROMPT` to the source session as a full Prompt turn through `sendPromptTurn` (`handoff.atoms.ts:39-51,91`). The prompt asks for a handoff document "written out in between <handoff> and </handoff> tags" (`libs/ui/src/host/handoffDocument.ts:5-13`);
   - **matches output.** `extractHandoffDocument(transcript.items)` takes the **last `agent_message` item** in the whole transcript and applies `/<handoff>([\s\S]*?)<\/handoff>/i`. Without a match it returns the **whole trimmed message** (`handoffDocument.ts:15,27-51`);
   - creates the target with `createSession(target, sourceCwd)` → `agent['session/new']({ cwd, mcpServers: [] })` (`handoff.atoms.ts:106`; `libs/ui/src/host/sessionRpc.ts:121-131`), inserts it into the snapshot, selects it, and applies the config diffs (`handoff.atoms.ts:115-129`);
   - seeds the target with `buildTargetHandoffSeedPrompt(doc)`, which re-wraps the document in `<handoff>` tags and ends with "ask the user what they would like to do next" (`handoffDocument.ts:17-24`; `handoff.atoms.ts:131-146`).
3. **Error policy.** Only the source prompt is a hard gate. Target create, config, and seed failures are logged as warnings and the handoff stops there (`handoff.atoms.ts:90,100-141`).
4. Glossary definition: `apps/desktop/GLOSSARY.md:180-181` ("Not an ACP protocol concept; not a durable Harness record (v1)").

### Concrete weaknesses

- **Silent wrong document.** With no tags in the reply, the whole last agent message becomes the document (`handoffDocument.ts:44-50`; this is tested as intended behaviour in `handoffDocument.test.ts:41-44`).
- **It may read the wrong turn.** `extractHandoffDocument` scans every transcript item, not just items from the handoff turn (`handoffDocument.ts:29-33`). If the handoff turn produces only thoughts or tool calls, it returns an `agent_message` from an **earlier** turn.
- **Splitting.** Agent text after a tool call starts a new `agent_message` item; chunks are appended only to the trailing item of the same kind (`libs/ui/src/host/sessionUpdateReducer.ts:366-374`). If the agent writes `<handoff>…</handoff>`, then runs a tool, then says "Done.", the last item is "Done." and that becomes the document.
- **Fragile regex.** The match is non-greedy and stops at the first `</handoff>`, so a document that quotes the tag gets truncated. Only `stopReason === 'cancelled'` fails the handoff (`handoff.atoms.ts:45-47`); `refusal` or `max_tokens` go straight to extraction.
- **Pollutes the source session.** The instruction is a visible user turn in the source transcript and costs a full agent turn.
- **Only the user can start it.** The agent cannot ask for a handoff or a new session.
- **Not extensible.** Every new capability needs another prompt and another parser.

### Where `mcpServers` is sent today

All session RPCs hard-code `[]`: `session/new` (`sessionRpc.ts:125`), `session/fork` (`:138`), `session/load` (`:153`), and the Config probe's throwaway `session/new` (`libs/ui/src/host/configProbe.ts:83`). `session/resume` omits it (`sessionRpc.ts:162`), even though the schema accepts it (`libs/effect-acp/src/schema/agent.ts:206`). `McpServer` is typed as an opaque `Schema.Unknown` (`libs/effect-acp/src/schema/common.ts:124`).

---

## 2. How T3 Code does it

### Hosting: in-process Streamable HTTP on the app server

- One MCP endpoint, `McpServer.layerHttp({ name: "T3 Code", path: "/mcp", protocols: [McpProtocol.v2025_06_18], allowSessionTermination: true, registrations })`, wrapped in an auth middleware (`apps/server/src/mcp/McpHttpServer.ts:1185-1194`). The tool set is `layerTools`, a merge of about 11 toolkits (`:1196-1210`). Each toolkit is registered with `McpServer.registerToolkit` (`:1071-1095`).
- It is mounted on T3's main Node HTTP router next to its other routes (`apps/server/src/server.ts:779-782`). There is no separate process or port.
- The endpoint URL comes from the bound server address and falls back to `127.0.0.1` when the bind address is unspecified (`apps/server/src/mcp/McpSessionRegistry.ts:72-90`). Default port 3773 (`apps/server/src/config.ts:29`).

### Per-session identity and auth

- `McpSessionRegistry.issue({ threadId, providerInstanceId, capabilities, subagent })` mints 32 random bytes as a base64url token, **stores only its SHA-256**, and returns `{ endpoint, authorizationHeader: "Bearer <token>", threadId, providerSessionId, … }` (`McpSessionRegistry.ts:97-140`).
- `resolve(token)` maps the hash back to a `McpThreadInvocationScope` (thread id, provider session id, capability set). Tokens expire after a 24 h idle "liveness window" and are refreshed on use and by `touch` on provider turns (`:60-65,142-172`). Revocation works per provider session, per thread, or for everything (`:174-192`).
- The auth middleware parses `Authorization: Bearer`, resolves the token, falls back to an optional OAuth client authenticator, and returns 401 with `WWW-Authenticate` otherwise. On success it provides `McpInvocationContext` to the request (`McpHttpServer.ts:196-249`). A comment explains why there is no OAuth for agents: "Launched agents cannot open OAuth browsers" (`:88`).
- Handlers learn **who called** from `McpInvocationContext`. For example, `t3_worktree_handoff` reads the scope and calls `service.handoff(scope, input)` (`apps/server/src/mcp/toolkits/worktree/handlers.ts:42-46`). `WorktreeMcpService` uses `scope.thread.threadId` (`apps/server/src/mcp/WorktreeMcpService.ts:83-106`).
- Lifecycle: `ProviderSessionManager` issues or reuses a credential per thread before the provider starts, reuses it across workspace handoffs if it still resolves with the same capabilities, and revokes it when the session is released (`apps/server/src/orchestration-v2/ProviderSessionManager.ts:450-518`).

### Injection per provider

T3 drives Claude and Codex through their **native SDKs**, not the ACP adapters this repo uses. Generic ACP covers the other agents.

| Provider                                    | How the T3 server is injected                                                                                                                                                                                                                                                                                                                                                                                   | Source                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Claude (Agent SDK)                          | `mcpServers["t3-code"] = { type: "http", url, headers: { Authorization }, timeout: 65 min }`, plus `allowedTools` that pre-approves `mcp__t3-code__*`                                                                                                                                                                                                                                                           | `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts:1775-1806`                                                 |
| Codex (app-server)                          | Per-thread config `mcp_servers.t3-code = { url, http_headers: { Authorization }, tool_timeout_sec }`. Only T3's own key is overridden, so the user's MCP servers survive.                                                                                                                                                                                                                                       | `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts:1382-1420`                                                  |
| Cursor (Cursor SDK)                         | `mcpServers["t3-code"] = { type: "http", url, headers }`                                                                                                                                                                                                                                                                                                                                                        | `packages/provider-cursor/src/server/adapter.ts:202-216`                                                                 |
| Generic ACP (Antigravity, registry agents…) | Three candidates are built for each session: (a) **stdio**, which runs the T3 binary itself with `acp-mcp-bridge` and env `T3_ACP_MCP_ENDPOINT` / `T3_ACP_MCP_AUTHORIZATION`; (b) `{ type: "acp", serverId: "t3-code" }`; (c) `{ type: "http", url, headers }` when the flavor sets `mcpOverHttp`. At `session/new` it picks **acp if `mcpCapabilities.acp`, else http if `mcpCapabilities.http`, else stdio.** | `packages/provider-acp/src/server/adapter.ts:803-862`; `packages/provider-acp/src/server/AcpSessionRuntime.ts:2135-2149` |

Notes from those sources:

- A comment explains why HTTP is opt-in per flavor: "codex-acp 1.2.0 and pi-acp drop injected HTTP servers" (`adapter.ts:820`). Antigravity and Copilot set `mcpOverHttp: true` (`apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.ts:211-212`; `packages/provider-acp-registry/src/server/adapter.ts:254-255`, "Copilot CLI 1.0.105 rejects stdio MCP servers from the client").
- **Stdio shim:** `apps/server/src/mcp/AcpMcpStdioBridge.ts`. The header comment reads "ACP mandates stdio MCP support; HTTP/SSE support varies" (`:13`). It forwards each stdin JSON-RPC line as a Streamable HTTP POST with `Authorization`, `mcp-session-id`, and `mcp-protocol-version` headers (`:75-120`, `:211-230`). Its entry point reads the env vars (`:323-345`) and is dispatched from `apps/server/src/bin.ts:35-37`.
- **MCP-over-ACP bridge:** `packages/provider-acp/src/server/mcpOverAcpBridge.ts` relays the agent's `mcp/*` requests on the ACP connection to the same HTTP endpoint (`:149-230`).
- **Terminal fallback:** "some ACP agents accept the injected MCP server but never expose its tools". In that case the instructions tell the agent to shell out with `acp-mcp-call <tool> '<json>'` (`packages/provider-core/src/server/orchestrationInstructions.ts:55-60`).

### Tool shapes relevant to Handoff

Tools are defined with `Tool.make(name, { description, parameters: Schema, success, failure, failureMode: "return", dependencies })` plus annotations (`Title`, `Readonly`, `Destructive`, `Idempotent`, `OpenWorld`). Examples:

- `t3_thread_launch`: creates one new top-level thread. Params: `title`, optional `projectId` / `scratch` / `modelSelection` / `runtimeMode` / `interactionMode` / `workspaceStrategy`, plus a task `message` and `clientRequestId` for safe retry (`apps/server/src/mcp/toolkits/project/tools.ts:124-150`).
- `create_threads`: several new top-level threads in this checkout (`apps/server/src/mcp/toolkits/orchestrator/tools.ts:210-221`).
- `delegate_task`: a child agent that sees only `task` (`orchestrator/tools.ts:86-97`).
- `t3_thread_transfer`: `action: "fork" | "merge_back" | "status"`; omitting `threadId` means "this thread", identified by the token (`apps/server/src/mcp/toolkits/thread/tools.ts:165-190`).
- `t3_worktree_handoff`: "Move THIS thread into a new git worktree… Call last in your turn… `continuationPrompt` resumes work there next turn" (`apps/server/src/mcp/toolkits/worktree/tools.ts:28-41`).

The descriptions T3 advertises are compact. A wrapper swaps the full codec schema for a smaller advertised JSON schema (`McpHttpServer.ts:1025-1051`; `apps/server/src/mcp/advertisedJsonSchema.ts`).

### How the agent learns to use them

- **Tool descriptions** carry most of the routing guidance (see above).
- **A fixed instruction block** explains when to use which tool, e.g. "`t3_thread_launch` and `create_threads` make new top-level threads, only when the user asks for a new thread" (`orchestrationInstructions.ts:4-30`). How it is delivered depends on the provider:
  - Claude SDK: `systemPrompt: { type: "preset", preset: "claude_code", append: … }` (`ClaudeAdapterV2.ts:1651-1664`);
  - Codex: developer-instruction sections (`apps/server/src/provider/CodexDeveloperInstructions.ts:49`);
  - ACP: "ACP lacks system/developer fields; inject context on first prompt and tool/mode changes". The block is wrapped around the user's text as `<t3_code_instructions>…</t3_code_instructions><user_request>…</user_request>` (`orchestrationInstructions.ts:76-104`).
- T3 measures tool choice with evals (`evals/mcp-tool-use/cases/*.ndjson`).

---

## 3. ACP spec constraints

From https://agentclientprotocol.com/protocol/v1/session-setup.md:

- "All Agents MUST support the stdio transport, while HTTP and SSE transports are optional capabilities". New agents SHOULD support HTTP.
- Stdio entries need `name`, `command` (absolute path), `args`, and optional `env`. HTTP entries need `type: "http"`, `name`, `url`, `headers`. SSE is the same shape and "was deprecated by the MCP spec".
- "Before using HTTP or SSE transports, Clients MUST verify the Agent's capabilities during initialization". `mcpCapabilities.http/sse` false or absent means unsupported.
- `session/load` and `session/resume` re-take the MCP servers; resume "reconnects to the requested MCP servers".
- Security: "`env` and `headers` values are credentials". Agents SHOULD NOT echo them back in updates, errors, `_meta`, or `session/list`.

From https://agentclientprotocol.com/protocol/v1/initialization.md: `mcpCapabilities` defines `http` and `sse`. Omitted capabilities "MUST" be treated as unsupported.

From https://agentclientprotocol.com/rfds/mcp-over-acp.md (**status: Draft**):

- `{ type: "acp", name, serverId }`, gated by `agentCapabilities.mcpCapabilities.acp: true`.
- One `mcp/message` method (request or notification) that the agent sends to the client over the **existing ACP connection**. Earlier `mcp/connect`/`mcp/disconnect` drafts were removed.
- Stated motivation: hosting tools "usually requires a separate HTTP listener or subprocess", while MCP-over-ACP "keeps the interaction on the authorized ACP channel". This matches this repo's WebView constraint exactly.

### Agents this repo launches (`libs/ui/src/host/agentLaunchTarget.ts:9-35`; launch commands in `libs/ui/src/host/acpLaunchCommand.ts:67-146`)

| Launch target      | Process                                               | `mcpCapabilities` (installed/probed)                              | Client `mcpServers` handling                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude-agent-acp` | `node <adapter entry>` (`0.100.0`, `~/.ao/providers`) | `{ http: true, sse: true }` (`acp-agent.js:1460-1463`)            | http/sse → SDK `{type,url,headers}`; entries with no `type` → stdio. Entries with `type: "acp"` are **silently dropped**, because only `http`/`sse`/untyped are handled (`node_modules/@agentclientprotocol/claude-agent-acp/dist/acp-agent.js:9042-9066`).                   |
| `codex-acp`        | `node <adapter entry>` (`2.5.0`)                      | `{ acp: false, http: true, sse: false }` (`index.js:49737-49741`) | stdio/http are mapped to Codex `mcp_servers` (`url`, `http_headers`). `acp` and `sse` raise `invalidParams` (`node_modules/@agentclientprotocol/codex-acp/dist/index.js:39505-39530`). By default, a name already in the user's Codex config is **skipped** (`:41921-41940`). |
| `antigravity-acp`  | managed `agy_acp_server` binary (`1.4.5`)             | `{ http: true, sse: true }`                                       | Probed live with a single `initialize` against `~/.ao/providers/antigravity-acp/runtime/1.4.5/agy_acp_server.par`. The response also advertised `_meta.antigravity.systemPrompt.append: true`.                                                                                |
| `cursor-acp`       | native `cursor-agent acp` (beta)                      | **Unconfirmed**: not installed here                               | https://cursor.com/docs/cli/acp only says ACP "supports [MCP servers] defined in a project-level or user-level `.cursor/mcp.json`". It does not say whether `session/new` `mcpServers` is honoured. Stdio support is required by the spec but has not been verified.          |

So every **confirmed** agent supports HTTP. A stdio shim is needed only as a fallback (Cursor unknown, future agents, and agents like the "codex-acp 1.2.0 drops HTTP" case T3 hit). Nobody advertises `acp` yet.

Adapter drift since the 2026-09-09 note: both adapters now accept an ACP `systemPrompt` on `session/new` (`{ mode: "append", content: [text…] }`; Claude also accepts `override`) and advertise it under `sessionCapabilities.systemPrompt`. Sources: `claude-agent-acp/dist/client-system-prompt.js:1-40`, which imports from `@agentclientprotocol/sdk/unstable` (an **unstable** RFD); `codex-acp/dist/index.js:40947-40966,49709-49718`. This gives a cross-agent way to deliver tool-usage instructions without wrapping prompts (see section 5).

---

## 4. MCP server implementation in TypeScript

### Effect (`effect@4.0.5`, installed)

`node_modules/effect/src/ai/McpServer.ts`:

- `layerHttp({ name, version, path, protocols, allowedOrigins?, allowSessionTermination?, … })`: Streamable HTTP on an `HttpRouter`. "Requests with an `Origin` header are rejected unless the exact origin appears in `allowedOrigins`; Origin-less non-browser clients remain valid. The surrounding HTTP server remains responsible for binding to an appropriate interface and installing authentication." (`:1595-1670`)
- `layerStdio(...)`: NDJSON stdio; requires `Stdio` (`:1494-1528`).
- `layer(...)`: no transport; "The surrounding layer graph must provide `RpcServer.Protocol`" (`:1430-1466`). This is the hook for a custom transport, e.g. MCP-over-ACP later **(inference)**.
- `registerToolkit` / `toolkit` register an `effect/ai` `Toolkit` (`:2044`, `:2212-2221`). Protocol adapters: `v2024_11_05` … `v2026_07_28` (`node_modules/effect/src/ai/McpProtocol.ts:211-254`).
- `@effect/platform-node@4.0.5` is installed (NodeHttpServer for a Node-hosted `layerHttp`).
- T3 uses exactly these APIs (`McpHttpServer.ts:14-15,1185-1194`) with `effect/http` `HttpRouter.middleware` for bearer auth.

### Official SDK (`@modelcontextprotocol/sdk@1.32.2`, transitive only)

It is pulled in by `@anthropic-ai/claude-agent-sdk`, not declared by this repo. Server transports are in `dist/esm/server/`: `stdio`, `streamableHttp`, `webStandardStreamableHttp` (with `allowedHosts` / `allowedOrigins` / `enableDnsRebindingProtection`), and deprecated `sse`; tool registration is `McpServer.registerTool` (`mcp.d.ts`). Using it would add a dependency and a second schema system (zod) next to Effect `Schema`, so Effect's own server is the better fit here **(inference / judgement)**.

### MCP spec requirements for a local HTTP server

From https://modelcontextprotocol.io/specification/2025-06-18/basic/transports:

- "Servers MUST validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks".
- "When running locally, servers SHOULD bind only to localhost (127.0.0.1)".
- "Servers SHOULD implement proper authentication for all connections".
- Clients "SHOULD support stdio whenever possible".

---

## 5. Recommendation for agent-orchestrator

### The constraint that shapes everything

The Harness (atoms, `sessionRpc`, the ACP client) runs in the **WebView** on desktop (`apps/desktop/src/bindHostRuntime.ts:1-5`; ADR `apps/desktop/docs/adr/0002-no-node-imports-in-desktop-src.md`) and goes through portable Host services (`apps/desktop/docs/adr/0009-host-services-in-atom-and-host-runtimes.md`). A WebView can spawn processes through `ChildProcessSpawner` (`libs/context-services-tauri/src/ChildProcessSpawnerLive.ts`) but cannot listen on a socket. T3's design, where the Node server is the app, therefore does not carry over directly.

Options for where the MCP endpoint lives:

| Option                                                     | Works on                  | Cost                                                              | Notes                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Node "MCP hub" child process spawned by the Harness** | Desktop + VS Code as-is   | One bundled script; no Rust or extension changes                  | **Recommended.** Same mechanism and `node` prerequisite the Claude/Codex adapters already use (`acpLaunchCommand.ts:74,134`). The Harness owns the hub's stdin/stdout, so tool calls reach the WebView over pipes it already holds. Crash safety comes from stdin EOF, the same pattern as `libs/ui/src/host/keepAwake.ts:8`. |
| B. Listener in Tauri Rust + VS Code extension host         | Needs two implementations | Rust HTTP server plus Channel relay; Node listener plus IPC relay | Duplicated per host. (Only `tauri-plugin-mcp-bridge` exists today, and only in debug builds: `apps/desktop/src-tauri/src/lib.rs:330-333`.)                                                                                                                                                                                    |
| C. MCP-over-ACP (`type: "acp"`)                            | Both, in-WebView          | Lowest once available: no process, no socket, no token            | **Not usable today.** Draft RFD; no agent here advertises `acp`; Claude silently drops it and Codex rejects it. This is the long-term target; Effect `McpServer.layer` over a custom `RpcServer.Protocol` should plug into it **(inference)**.                                                                                |
| D. Per-session stdio server spawned by the agent           | —                         | —                                                                 | Still needs to reach the app, which brings back A or B. Useful only as a **shim** in front of A.                                                                                                                                                                                                                              |

### Design sketch (A)

1. **Hub process** (new bundled resource, e.g. `ao-mcp-hub.mjs`, resolved through `BundledResource`)
   - Started once per Harness runtime with `node ao-mcp-hub.mjs` and piped stdio. It binds `127.0.0.1:0` and writes `{ "port": n }` as the first stdout line.
   - Serves Effect `McpServer.layerHttp({ path: "/mcp", protocols: [v2025_06_18 (+ newer)], allowedOrigins: [] })` behind a bearer-auth `HttpRouter.middleware`, the same pattern as T3 `McpHttpServer.ts:196-249`. Origin-carrying (browser) requests are refused.
   - Tool handlers stay thin. Each one sends `{ id, token, tool, args }` to the Harness over stdout NDJSON and waits for the matching reply on stdin. The hub holds no session state, and **all tool logic stays in `libs/ui` atoms**, next to Handoff today.
   - It exits on stdin EOF, which happens when the WebView reloads or dies.
   - Open: whether the hub imports `effect` from a bundle or the adapter runtime tree (packaging per ADR 0006/0017).
2. **Per-session identity**
   - A WebView-side `McpCredentials` service mints a 32-byte random token **before** `session/new`, `session/load`, `session/fork`, and `session/resume`, and passes `{ type: "http", name: "agent-orchestrator", url: "http://127.0.0.1:<port>/mcp", headers: [{ name: "Authorization", value: "Bearer <token>" }] }`.
   - The token is bound to `(launchTarget, sessionId)` once the response arrives. For `session/new` the id does not exist until then. Tool calls happen only inside a prompt turn, which starts after the response, so pending → bound is safe **(inference)**.
   - Tokens are revoked on `closeSession`, on delete, and when the hub restarts.
   - The Config probe keeps passing `[]` (`configProbe.ts:83`).
   - Use a distinctive server name: Codex skips client servers whose name already exists in the user's config (`codex-acp/dist/index.js:41929-41932`).
3. **Transport choice per agent** (T3's rule from `AcpSessionRuntime.ts:2135-2149`)
   - Read `initialize.agentCapabilities.mcpCapabilities`: `acp` (future) → MCP-over-ACP; else `http` → the HTTP entry above; else stdio shim `node ao-mcp-shim.mjs` with env `AO_MCP_URL` / `AO_MCP_AUTHORIZATION`, a port of T3's `AcpMcpStdioBridge.ts`.
   - Give `McpServer` in `libs/effect-acp/src/schema/common.ts:124` a real tagged union (stdio | http | sse | acp) instead of `Schema.Unknown`.
4. **Tool set**
   - **Phase 1:** `submit_handoff({ document: string })`.
     - Keep the user-initiated flow and the `HandoffModal`. Change the source prompt to "Call the `submit_handoff` tool with the handoff document."
     - The handler resolves a `Deferred` keyed by the calling session; `handoffSessionAtomFn` awaits that instead of running `extractHandoffDocument`.
     - This removes the regex, the "whole message" fallback, and the wrong-turn and split-message bugs from section 1.
     - If the turn ends without the tool being called, raise `HandoffError` (no silent fallback).
     - The seed prompt can stay text.
   - **Phase 2:** agent-initiated `handoff({ document, targetLaunchTarget?, configValues? })` and/or `create_session({ prompt, launchTarget?, cwd? })`. These should probably go through a user confirmation (an Attention event / modal) before `session/new`, because the agent would be spending the user's budget on another provider **(judgement)**. The token identifies the source, so the agent never passes its own session id, as with T3's "Omit `threadId` for this thread".
   - Follow T3's patterns: `failureMode: "return"`, Destructive/OpenWorld annotations, and a `clientRequestId` for safe retry.
5. **How the agent learns about the tools**
   - Tool descriptions first: they are the only channel common to every agent.
   - For phase 1 nothing else is needed, because the Harness's own prompt names the tool.
   - For agent-initiated tools, add a short instruction block through the per-agent channels in `2026-09-10-acp-system-prompt-injection.md`: Claude `_meta.systemPrompt` or the ACP `systemPrompt` append (now supported by both adapters, unstable), and Antigravity's advertised `systemPrompt.append`. Fall back to T3's first-prompt wrapping for agents with neither.
6. **Migration**
   - Gate on "session has a bound MCP credential". Sessions created before the change, or whose agent refused the server, fall back to the current text path.
   - Delete `extractHandoffDocument` after one release. Update `apps/desktop/GLOSSARY.md` "Handoff" and add an ADR for the hub.

### Open questions and risks

- **Permission prompts.** Claude's adapter will likely route MCP tool calls through `session/request_permission` in default mode. T3 avoids this by pre-approving through SDK `allowedTools` (`ClaudeAdapterV2.ts:1792-1797`). Whether `_meta.claudeCode.options.allowedTools` does the same through the ACP adapter is **unverified**. A prompt for `submit_handoff` during a user-started Handoff is harmless but adds friction.
- **Agents that accept the server but hide the tools.** T3 hit this and added a terminal fallback (`orchestrationInstructions.ts:55-60`). Needs a smoke test per agent; Cursor is the main unknown.
- **Node prerequisite.** Users who enable only Cursor/Antigravity may not have passed the Node gate (`libs/ui/src/components/NodePrerequisiteGate.tsx`). Either require Node for MCP or disable the feature with a reason.
- **Multiple WebViews** (several VS Code windows) each run their own hub, port, and tokens. That is fine, because tokens are per Harness **(inference)**.
- **Credential hygiene.** Tokens are credentials under ACP (section 3). Do not log `session/new` params with headers unredacted: check the developer panel RPC wire log (`libs/ui/src/components/developerPanel/rpcWireLogFilter.test.ts:116` shows `mcpServers` are logged).
- **Load/resume.** Re-issue tokens on every `session/load` or `session/resume`; agents reconnect to the MCP servers given at that point (ACP session-setup).
- **Timeouts.** A tool that waits on the user (a phase 2 confirmation) needs long MCP timeouts; T3 sets 65 min for Claude and `tool_timeout_sec` for Codex. Adapter defaults through ACP are **unverified**.

---

## Sources checklist

| Claim                                                | Source                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handoff prompt, regex, fallback, seed                | `libs/ui/src/host/handoffDocument.ts:5-51`; `libs/ui/src/host/handoffDocument.test.ts:41-44`                                                                                                   |
| Handoff orchestration                                | `libs/ui/src/atoms/handoff.atoms.ts:29-161`                                                                                                                                                    |
| UI trigger                                           | `libs/ui/src/components/sessionChat/SessionChatBody.tsx:736-777`; `HandoffModal.tsx`                                                                                                           |
| Chunk merge / item splitting                         | `libs/ui/src/host/sessionUpdateReducer.ts:348-384`                                                                                                                                             |
| `mcpServers: []` everywhere; opaque schema           | `libs/ui/src/host/sessionRpc.ts:125,138,153`; `libs/ui/src/host/configProbe.ts:83`; `libs/effect-acp/src/schema/common.ts:124`                                                                 |
| WebView-hosted Harness                               | `apps/desktop/src/bindHostRuntime.ts`; `apps/desktop/docs/adr/0002-*.md`, `0009-*.md`                                                                                                          |
| Launch commands / node                               | `libs/ui/src/host/acpLaunchCommand.ts:67-146`                                                                                                                                                  |
| T3 HTTP MCP endpoint + auth                          | `t3code/apps/server/src/mcp/McpHttpServer.ts:88-249,1185-1210`; `apps/server/src/server.ts:779-782`                                                                                            |
| T3 per-thread tokens                                 | `t3code/apps/server/src/mcp/McpSessionRegistry.ts:60-192`; `orchestration-v2/ProviderSessionManager.ts:450-518`                                                                                |
| T3 injection per provider                            | `ClaudeAdapterV2.ts:1775-1806`; `CodexAdapterV2.ts:1382-1420`; `provider-cursor/src/server/adapter.ts:202-216`; `provider-acp/src/server/adapter.ts:803-862`; `AcpSessionRuntime.ts:2135-2149` |
| T3 stdio shim / MCP-over-ACP bridge                  | `t3code/apps/server/src/mcp/AcpMcpStdioBridge.ts`; `apps/server/src/bin.ts:35-37`; `packages/provider-acp/src/server/mcpOverAcpBridge.ts`                                                      |
| T3 tool definitions                                  | `toolkits/project/tools.ts:124-150`; `toolkits/orchestrator/tools.ts:86-97,210-221`; `toolkits/thread/tools.ts:165-190`; `toolkits/worktree/tools.ts:28-41`                                    |
| T3 instructions delivery                             | `packages/provider-core/src/server/orchestrationInstructions.ts:4-141`; `ClaudeAdapterV2.ts:1651-1664`                                                                                         |
| ACP MCP transports / capability check / security     | https://agentclientprotocol.com/protocol/v1/session-setup.md                                                                                                                                   |
| `mcpCapabilities` fields                             | https://agentclientprotocol.com/protocol/v1/initialization.md                                                                                                                                  |
| MCP-over-ACP draft                                   | https://agentclientprotocol.com/rfds/mcp-over-acp.md                                                                                                                                           |
| Claude adapter caps + mapping + systemPrompt         | `node_modules/@agentclientprotocol/claude-agent-acp/dist/acp-agent.js:1436-1463,9042-9076`; `dist/client-system-prompt.js`                                                                     |
| Codex adapter caps + mapping + dedupe + systemPrompt | `node_modules/@agentclientprotocol/codex-acp/dist/index.js:39505-39530,40947-40966,41901-41940,49709-49741`                                                                                    |
| Antigravity caps                                     | Live `initialize` probe of `agy_acp_server` 1.4.5 (2026-11-07)                                                                                                                                 |
| Cursor ACP MCP                                       | https://cursor.com/docs/cli/acp                                                                                                                                                                |
| Effect McpServer APIs                                | `node_modules/effect/src/ai/McpServer.ts:1430-1528,1595-1670,2044,2212`; `McpProtocol.ts:211-254`                                                                                              |
| MCP Streamable HTTP security                         | https://modelcontextprotocol.io/specification/2025-06-18/basic/transports                                                                                                                      |

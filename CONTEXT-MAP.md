# Context Map

Multi-context index for **Agent Orchestrator**. Each package under `apps/*` and `libs/*` owns a glossary (`CONTEXT.md`) and may own ADRs under `docs/adr/` when decisions exist.

## Contexts

| Context | Glossary | ADRs | Scope |
| --- | --- | --- | --- |
| **effect-acp** | [`libs/effect-acp/CONTEXT.md`](./libs/effect-acp/CONTEXT.md) | — | Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): JSON-RPC over stdio, schema, transport, and connection lifecycle |
| **context-services** | [`libs/context-services/CONTEXT.md`](./libs/context-services/CONTEXT.md) | — | Portable host abstractions (e.g. OS paths, env) exposed as Effect `Context` services |
| **context-services-node** | [`libs/context-services-node/CONTEXT.md`](./libs/context-services-node/CONTEXT.md) | — | Node.js live layers for `@lib/context-services` |
| **context-services-tauri** | [`libs/context-services-tauri/CONTEXT.md`](./libs/context-services-tauri/CONTEXT.md) | — | Tauri live layers for `@lib/context-services` and Effect platform primitives |
| **ao-home** | [`libs/ao-home/CONTEXT.md`](./libs/ao-home/CONTEXT.md) | [`libs/ao-home/docs/adr/`](./libs/ao-home/docs/adr/) | Agent Orchestrator home (`~/.ao`) seam: settings document (and later session usage) filesystem I/O |
| **desktop** | [`apps/desktop/CONTEXT.md`](./apps/desktop/CONTEXT.md) | [`apps/desktop/docs/adr/`](./apps/desktop/docs/adr/) | Tauri + React **Agent Harness** — ACP Client for Codex and Claude (Gemini typed, not mounted) via external ACP Agents |

## Relationships

- **desktop → effect-acp**: the Agent Harness (this repo's Orchestrator) is the ACP Client; effect-acp is its wire library (`connectAcpAgent`, schemas, transport)
- **desktop → context-services**: portable host abstractions (`OS` and related tags)
- **desktop → context-services-tauri**: Tauri live layers (`TauriServicesLive`) for host OS / Path / FileSystem / ChildProcessSpawner
- **desktop → ao-home** (planned): desktop will consume the home seam for settings and session usage; not wired yet
- **ao-home → context-services**: uses the portable `OS` service (`homedir`) plus Effect `Path` / `FileSystem`
- **context-services → context-services-node**: context-services-node provides the Node/Bun live layer for the OS service defined in context-services
- **context-services → context-services-tauri**: context-services-tauri provides the Tauri live layers for the OS service and Effect platform primitives
- **desktop → external ACP agents**: Harness spawns provider subprocesses — ACP adapters from the adapter resource tree (`codex-acp`, `claude-agent-acp`) — and connects over stdio. Gemini CLI (`gemini-cli`) is typed as a launch target but not mounted until the effect-acp shim lands

## Which context to read

- **ACP protocol, RPC, transport, agent connection** → effect-acp
- **Desktop app, Agent Harness, provider backends, Tauri host** → desktop
- **Agent Orchestrator home (`~/.ao`), settings document on disk** → ao-home
- **Host OS / environment access** → context-services (+ context-services-node for Node bindings; context-services-tauri for Tauri bindings)

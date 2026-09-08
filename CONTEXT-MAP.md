# Context Map

Multi-context index for **Agent Orchestrator**. Each package under `apps/*` and `libs/*` owns a glossary (`CONTEXT.md`) and optional ADRs (`docs/adr/`).

System-wide ADRs live in [`docs/adr/`](./docs/adr/).

## Contexts

| Context | Glossary | ADRs | Scope |
| --- | --- | --- | --- |
| **effect-acp** | [`libs/effect-acp/CONTEXT.md`](./libs/effect-acp/CONTEXT.md) | [`libs/effect-acp/docs/adr/`](./libs/effect-acp/docs/adr/) | Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): JSON-RPC over stdio, schema, transport, and connection lifecycle |
| **context-services** | [`libs/context-services/CONTEXT.md`](./libs/context-services/CONTEXT.md) | [`libs/context-services/docs/adr/`](./libs/context-services/docs/adr/) | Portable host abstractions (e.g. OS paths, env) exposed as Effect `Context` services |
| **context-services-node** | [`libs/context-services-node/CONTEXT.md`](./libs/context-services-node/CONTEXT.md) | [`libs/context-services-node/docs/adr/`](./libs/context-services-node/docs/adr/) | Node.js live layers for `@lib/context-services` |
| **desktop** | [`apps/desktop/CONTEXT.md`](./apps/desktop/CONTEXT.md) | [`apps/desktop/docs/adr/`](./apps/desktop/docs/adr/) | Tauri + React **Agent Harness** — ACP Client for Codex, Claude, and Gemini via external ACP Agents (adapters or native CLI) |

## Relationships

- **desktop → effect-acp**: the Agent Harness (this repo's Orchestrator) is the ACP Client; effect-acp is its wire library (`connectAcpAgent`, schemas, transport)
- **desktop → context-services**: portable host abstractions; Tauri live layers live under `apps/desktop/src/context-services/`
- **context-services → context-services-node**: context-services-node provides the Node/Bun live layer for the OS service defined in context-services
- **desktop → external ACP agents**: Harness spawns provider subprocesses — ACP adapters from the adapter resource tree (`codex-acp`, `claude-agent-acp`), or Gemini CLI (native ACP) — and connects over stdio

## Which context to read

- **ACP protocol, RPC, transport, agent connection** → effect-acp
- **Desktop app, Agent Harness, provider backends, Tauri host** → desktop
- **Host OS / environment access** → context-services (+ context-services-node for Node bindings; Tauri bindings under desktop)
- **Monorepo tooling, CI, workspace layout** → system-wide ADRs in `docs/adr/` (when they exist)

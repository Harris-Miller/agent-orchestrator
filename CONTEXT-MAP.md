# Context Map

Multi-context index for **Agent Orchestrator**. Each package under `apps/*` and `libs/*` owns a glossary (`CONTEXT.md`) and optional ADRs (`docs/adr/`).

System-wide ADRs live in [`docs/adr/`](./docs/adr/).

## Contexts

| Context | Glossary | ADRs | Scope |
| --- | --- | --- | --- |
| **effect-acp** | [`libs/effect-acp/CONTEXT.md`](./libs/effect-acp/CONTEXT.md) | [`libs/effect-acp/docs/adr/`](./libs/effect-acp/docs/adr/) | Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): JSON-RPC over stdio, schema, transport, and connection lifecycle |
| **context-services** | [`libs/context-services/CONTEXT.md`](./libs/context-services/CONTEXT.md) | [`libs/context-services/docs/adr/`](./libs/context-services/docs/adr/) | Portable host abstractions (e.g. OS paths, env) exposed as Effect `Context` services |
| **context-services-node** | [`libs/context-services-node/CONTEXT.md`](./libs/context-services-node/CONTEXT.md) | [`libs/context-services-node/docs/adr/`](./libs/context-services-node/docs/adr/) | Node.js live layers for `@lib/context-services` |
| **jsonrpc-echo** | [`apps/jsonrpc-echo/CONTEXT.md`](./apps/jsonrpc-echo/CONTEXT.md) | — | Private test Agent fixture (never published); controlled I/O for effect-acp tests |

## Relationships

- **Orchestrator → effect-acp**: the Orchestrator is the Client; effect-acp is its ACP wire library (`connectAcpAgent`, schemas, transport)
- **effect-acp → jsonrpc-echo**: jsonrpc-echo is a private test Agent; effect-acp integration tests spawn it via `connectAcpAgent`
- **context-services → context-services-node**: context-services-node provides the Node/Bun live layer for the OS service defined in context-services
- **effect-acp ↔ context-services**: independent today; future orchestrator code may use OS for Agent spawn cwd/env while speaking ACP via effect-acp

## Which context to read

- **ACP protocol, RPC, transport, agent connection** → effect-acp (and jsonrpc-echo for the reference agent)
- **Host OS / environment access** → context-services (+ context-services-node for Node bindings)
- **Monorepo tooling, CI, workspace layout** → system-wide ADRs in `docs/adr/` (when they exist)

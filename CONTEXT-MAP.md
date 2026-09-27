# Context Map

Multi-context index for **Agent Orchestrator**. Each package under `apps/*` and `libs/*` owns a glossary (`CONTEXT.md`) and may own ADRs under `docs/adr/` when decisions exist.

## Contexts

| Context | Glossary | ADRs | Scope |
| --- | --- | --- | --- |
| **effect-acp** | [`libs/effect-acp/CONTEXT.md`](./libs/effect-acp/CONTEXT.md) | — | Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): JSON-RPC over stdio, schema, transport, and connection lifecycle |
| **context-services** | [`libs/context-services/CONTEXT.md`](./libs/context-services/CONTEXT.md) | [`libs/context-services/docs/adr/`](./libs/context-services/docs/adr/) | Portable host abstractions (OS, BundledResource, Host services) exposed as Effect `Context` services |
| **context-services-node** | [`libs/context-services-node/CONTEXT.md`](./libs/context-services-node/CONTEXT.md) | — | Node.js live layers for `@lib/context-services` |
| **context-services-tauri** | [`libs/context-services-tauri/CONTEXT.md`](./libs/context-services-tauri/CONTEXT.md) | — | Tauri live layers for `@lib/context-services` and Effect platform primitives |
| **ao-home** | [`libs/ao-home/CONTEXT.md`](./libs/ao-home/CONTEXT.md) | [`libs/ao-home/docs/adr/`](./libs/ao-home/docs/adr/) | Agent Orchestrator home (`~/.ao`) seam: User settings, adapter roster documents, and session usage filesystem I/O |
| **gemini-acp** | planned [`libs/gemini-acp/CONTEXT.md`](./libs/gemini-acp/CONTEXT.md) | — | ACP adapter in front of Gemini CLI: completes session lifecycle (`list` / `close` / `delete` / hot-cold `resume`); Issue #42 |
| **desktop** | [`apps/desktop/CONTEXT.md`](./apps/desktop/CONTEXT.md) | [`apps/desktop/docs/adr/`](./apps/desktop/docs/adr/) | Tauri + React **Agent Harness** — ACP Client for Codex, Claude, and (planned) Gemini via ACP adapters |
| **ui** | [`libs/ui/CONTEXT.md`](./libs/ui/CONTEXT.md) | — | Shared webview harness stack (Backend Harness, phase atoms) + future React UI for desktop and VS Code webview |

## Relationships

- **desktop → effect-acp**: the Agent Harness (this repo's Orchestrator) is the ACP Client; effect-acp is its wire library (`connectAcpAgent`, schemas, transport)
- **desktop → context-services**: portable host abstractions (`OS`, `BundledResource`, Host services)
- **desktop → context-services-tauri**: Tauri live layers (`TauriServicesLive`) for Host services
- **desktop → ao-home**: desktop hydrates User settings into Effect Atoms and the Settings page reads/writes via `@lib/ao-home`; session usage persists under `sessions/<id>/usage.json` through the same seam
- **desktop → ui**: desktop binds Host Live + harness atoms factories from `@lib/ui`; imports phase atoms / Backend Harness helpers; chat/session atoms stay desktop-local
- **ui → context-services**: portable Host services tags (no Live)
- **ui → ao-home**: session usage persist from harness atoms; bootstrap types
- **ui → effect-acp**: ACP connection / RPCs for Backend Harness
- **ao-home → context-services**: uses the portable `OS` service (`homedir`) plus Effect `Path` / `FileSystem`
- **gemini-acp → effect-acp**: adapter is an ACP Agent (`serveAcpAgent`) and an ACP Client toward Gemini CLI (`connectAcpAgent`)
- **gemini-acp → ao-home**: durable adapter roster document + lock under `~/.ao/adapters/gemini-acp/`
- **desktop → gemini-acp** (planned): Harness spawns `gemini-acp` from the adapter resource tree like other ACP adapters
- **context-services → context-services-node**: context-services-node provides the Node/Bun live layer for the OS service defined in context-services
- **context-services → context-services-tauri**: context-services-tauri provides the Tauri live layers for Host services and Effect platform primitives
- **desktop → external ACP agents**: Harness spawns provider subprocesses — ACP adapters from the adapter resource tree (`codex-acp`, `claude-agent-acp`, planned `gemini-acp`) — and connects over stdio. Gemini CLI remains the vendor CLI behind `gemini-acp` (native ACP; missing session lifecycle capabilities filled by the adapter)
- **vscode → ui**: VS Code webview will reuse the same harness stack from `@lib/ui` (Track B)

## Which context to read

- **ACP protocol, RPC, transport, agent connection** → effect-acp
- **Desktop app, Agent Harness, provider backends, Tauri host** → desktop
- **Agent Orchestrator home (`~/.ao`), User settings on disk** → ao-home
- **Host OS / environment / bundled resources** → context-services (+ context-services-node for Node bindings; context-services-tauri for Tauri bindings)
- **Shared harness atoms / Backend Harness (desktop + VS Code webview)** → ui

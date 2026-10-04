# Context Map

Multi-context index for **Agent Orchestrator**. Each package under `apps/*` and `libs/*` owns a glossary (`CONTEXT.md`) and may own ADRs under `docs/adr/` when decisions exist.

## Contexts

| Context | Glossary | ADRs | Scope |
| --- | --- | --- | --- |
| **effect-acp** | [`libs/effect-acp/CONTEXT.md`](./libs/effect-acp/CONTEXT.md) | — | Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): JSON-RPC over stdio, schema, transport, and connection lifecycle |
| **context-services** | [`libs/context-services/CONTEXT.md`](./libs/context-services/CONTEXT.md) | [`libs/context-services/docs/adr/`](./libs/context-services/docs/adr/) | Portable host abstractions (OS, BundledResource, Clipboard, Host services) exposed as Effect `Context` services |
| **context-services-node** | [`libs/context-services-node/CONTEXT.md`](./libs/context-services-node/CONTEXT.md) | — | Node.js live layers for `@lib/context-services` |
| **context-services-tauri** | [`libs/context-services-tauri/CONTEXT.md`](./libs/context-services-tauri/CONTEXT.md) | — | Tauri live layers for `@lib/context-services` and Effect platform primitives |
| **context-services-vscode-webview** | [`libs/context-services-vscode-webview/CONTEXT.md`](./libs/context-services-vscode-webview/CONTEXT.md) | — | VS Code webview Host services Live + extension↔webview IPC codec for `@lib/context-services` |
| **ao-home** | [`libs/ao-home/CONTEXT.md`](./libs/ao-home/CONTEXT.md) | [`libs/ao-home/docs/adr/`](./libs/ao-home/docs/adr/) | Agent Orchestrator home (`~/.ao`) seam: User settings, adapter roster documents, and session usage filesystem I/O |
| **gemini-acp** | [`libs/gemini-acp/CONTEXT.md`](./libs/gemini-acp/CONTEXT.md) | — | ACP adapter in front of Gemini CLI: completes session lifecycle (`list` / `close` / `delete` / hot-cold `resume`); Issue #42 |
| **desktop** | [`apps/desktop/CONTEXT.md`](./apps/desktop/CONTEXT.md) | [`apps/desktop/docs/adr/`](./apps/desktop/docs/adr/) | Tauri + React **Agent Harness** — ACP Client for Codex, Claude, and (planned) Gemini via ACP adapters |
| **ui** | [`libs/ui/CONTEXT.md`](./libs/ui/CONTEXT.md) | [`libs/ui/docs/adr/`](./libs/ui/docs/adr/) | Shared Agent Harness webview context: Backend Harness + Harness application state + shared Providers/theme React surfaces |
| **vscode** | [`apps/vscode/CONTEXT.md`](./apps/vscode/CONTEXT.md) | [`apps/vscode/docs/adr/`](./apps/vscode/docs/adr/) | VS Code extension: extension-host fulfillment + webview Host (Providers mount via shared UI) |

## Relationships

- **desktop → effect-acp**: the Agent Harness (this repo's Orchestrator) is the ACP Client; effect-acp is its wire library (`connectAcpAgent`, schemas, transport)
- **desktop → context-services**: portable host abstractions (`OS`, `BundledResource`, `Clipboard`, Host services)
- **desktop → context-services-tauri**: Tauri live layers (`TauriServicesLive`) for Host services
- **desktop → ao-home**: desktop hydrates User settings into Effect Atoms and the Settings page reads/writes via `@lib/ao-home`; session usage persists under `sessions/<id>/usage.json` through the same seam
- **desktop → ui**: desktop supplies Host Live and mounts shared Providers/theme/ACP surfaces from `@lib/ui`; host-specific chrome (ThemeSelect, Settings shell) stays desktop-local
- **ui → context-services**: portable Host services tags (no Live)
- **ui → ao-home**: session usage persist and User settings I/O from Harness application state
- **ui → effect-acp**: ACP connection / RPCs for Backend Harness
- **ao-home → context-services**: uses the portable `OS` service (`homedir`) plus Effect `Path` / `FileSystem`
- **gemini-acp → effect-acp**: adapter is an ACP Agent (`serveAcpAgent`) and an ACP Client toward Gemini CLI (`connectAcpAgent`)
- **gemini-acp → ao-home**: durable adapter roster document + lock under `~/.ao/adapters/gemini-acp/`
- **desktop → gemini-acp** (planned): Harness spawns `gemini-acp` from the adapter resource tree like other ACP adapters
- **context-services → context-services-node**: context-services-node provides the Node/Bun live layer for the OS service defined in context-services
- **context-services → context-services-tauri**: context-services-tauri provides the Tauri live layers for Host services and Effect platform primitives
- **context-services → context-services-vscode-webview**: context-services-vscode-webview provides the webview Host services Live and extension↔webview IPC codec (Clipboard + IPC clients + OS snapshot; issue #83)
- **desktop → external ACP agents**: Harness spawns provider subprocesses — ACP adapters from the adapter resource tree (`codex-acp`, `claude-agent-acp`, planned `gemini-acp`) — and connects over stdio. Gemini CLI remains the vendor CLI behind `gemini-acp` (native ACP; missing session lifecycle capabilities filled by the adapter)
- **vscode → ui**: VS Code webview supplies Host Live via `@lib/context-services-vscode-webview` and reuses Harness application state (Track B / #83)
- **vscode → context-services-vscode-webview**: extension host imports protocol codec/types for fulfillment; webview boots `makeHostServicesLive`

## Which context to read

- **ACP protocol, RPC, transport, agent connection** → effect-acp
- **Desktop app, Agent Harness, provider backends, Tauri host** → desktop
- **Agent Orchestrator home (`~/.ao`), User settings on disk** → ao-home
- **Host OS / environment / bundled resources / clipboard / VS Code webview Host Live + extension↔webview IPC** → context-services (+ context-services-node for Node bindings; context-services-tauri for Tauri bindings; context-services-vscode-webview for webview Live + IPC codec)
- **Shared Harness application state / Backend Harness / shared Providers & theme React** → ui
- **VS Code extension / sidebar webview Host / extension↔webview IPC fulfillment** → vscode

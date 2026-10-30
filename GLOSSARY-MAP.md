# Glossary Map

Multi-context index for **Agent Orchestrator**. Each package under `apps/*` and `libs/*` owns a glossary (`GLOSSARY.md`) and may own ADRs under `docs/adr/` when decisions exist.

## Contexts

| Context                             | Glossary                                                                                                 | ADRs                                                                   | Scope                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **effect-acp**                      | [`libs/effect-acp/GLOSSARY.md`](./libs/effect-acp/GLOSSARY.md)                                           | —                                                                      | Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): JSON-RPC over stdio, schema, transport, and connection lifecycle |
| **context-services**                | [`libs/context-services/GLOSSARY.md`](./libs/context-services/GLOSSARY.md)                               | [`libs/context-services/docs/adr/`](./libs/context-services/docs/adr/) | Portable host abstractions (OS, BundledResource, Clipboard, Host services) exposed as Effect `Context` services                                          |
| **context-services-node**           | [`libs/context-services-node/GLOSSARY.md`](./libs/context-services-node/GLOSSARY.md)                     | —                                                                      | Node.js live layers for `@lib/context-services`                                                                                                          |
| **context-services-tauri**          | [`libs/context-services-tauri/GLOSSARY.md`](./libs/context-services-tauri/GLOSSARY.md)                   | —                                                                      | Tauri live layers for `@lib/context-services` and Effect platform primitives                                                                             |
| **context-services-vscode-webview** | [`libs/context-services-vscode-webview/GLOSSARY.md`](./libs/context-services-vscode-webview/GLOSSARY.md) | —                                                                      | VS Code webview Host services Live + extension↔webview IPC codec for `@lib/context-services`                                                             |
| **ao-home**                         | [`libs/ao-home/GLOSSARY.md`](./libs/ao-home/GLOSSARY.md)                                                 | [`libs/ao-home/docs/adr/`](./libs/ao-home/docs/adr/)                   | Agent Orchestrator home (`~/.ao`) seam: User settings, Adapter history documents, session usage, `harness/` caches, and Antigravity runtime paths        |
| **desktop**                         | [`apps/desktop/GLOSSARY.md`](./apps/desktop/GLOSSARY.md)                                                 | [`apps/desktop/docs/adr/`](./apps/desktop/docs/adr/)                   | Tauri + React **Agent Harness** — ACP Client for Codex, Claude, Antigravity (managed runtime), and Cursor (native Vendor CLI ACP)                        |
| **ui**                              | [`libs/ui/GLOSSARY.md`](./libs/ui/GLOSSARY.md)                                                           | [`libs/ui/docs/adr/`](./libs/ui/docs/adr/)                             | Shared Agent Harness webview context: Backend Harness + Harness application state + shared Settings panes / theme React surfaces                         |
| **vscode**                          | [`apps/vscode/GLOSSARY.md`](./apps/vscode/GLOSSARY.md)                                                   | [`apps/vscode/docs/adr/`](./apps/vscode/docs/adr/)                     | VS Code extension: extension-host fulfillment + webview Host (Settings via shared UI panes)                                                              |

## Relationships

- **desktop → effect-acp**: the Agent Harness (this repo's Orchestrator) is the ACP Client; effect-acp is its wire library (`connectAcpAgent`, schemas, transport)
- **desktop → context-services**: portable host abstractions (`OS`, `BundledResource`, `Clipboard`, Host services)
- **desktop → context-services-tauri**: Tauri live layers (`TauriServicesLive`) for Host services
- **desktop → ao-home**: desktop hydrates User settings into Effect Atoms and the Settings page reads/writes via `@lib/ao-home`; session usage persists under `sessions/<id>/usage.json` through the same seam
- **desktop → ui**: desktop supplies Host Live and mounts shared Settings panes / theme / ACP surfaces from `@lib/ui`; Settings **shell** chrome (category rail) stays desktop-local
- **ui → context-services**: portable Host services tags (no Live)
- **ui → ao-home**: session usage persist and User settings I/O from Harness application state
- **ui → effect-acp**: ACP connection / RPCs for Backend Harness
- **ao-home → context-services**: uses the portable `OS` service (`homedir`) plus Effect `Path` / `FileSystem`
- **context-services → context-services-node**: context-services-node provides the Node/Bun live layer for the OS service defined in context-services
- **context-services → context-services-tauri**: context-services-tauri provides the Tauri live layers for Host services and Effect platform primitives
- **context-services → context-services-vscode-webview**: context-services-vscode-webview provides the webview Host services Live and extension↔webview IPC codec (Clipboard + IPC clients + OS snapshot; issue #83)
- **desktop → external ACP agents**: Harness spawns provider subprocesses — ACP adapters from the adapter resource tree (`codex-acp`, `claude-agent-acp`), native Vendor CLI ACP (`cursor-acp` → `cursor-agent acp`), or managed Antigravity ACP (`antigravity-acp` → `agy_acp_server` under `~/.ao/antigravity-acp/`) — and connects over stdio
- **ui → ao-home (Antigravity)**: pin download materializes into AO home; spawn env sets `GEMINI_HOME` to `~/.ao/antigravity-acp/home`
- **vscode → ui**: VS Code webview supplies Host Live via `@lib/context-services-vscode-webview` and reuses Harness application state (Track B / #83)
- **vscode → context-services-vscode-webview**: extension host imports protocol codec/types for fulfillment; webview boots `makeHostServicesLive`

## Which context to read

- **ACP protocol, RPC, transport, agent connection** → effect-acp
- **Desktop app, Agent Harness, provider backends, Tauri host** → desktop
- **Agent Orchestrator home (`~/.ao`), User settings on disk** → ao-home
- **Host OS / environment / bundled resources / clipboard / VS Code webview Host Live + extension↔webview IPC** → context-services (+ context-services-node for Node bindings; context-services-tauri for Tauri bindings; context-services-vscode-webview for webview Live + IPC codec)
- **Shared Harness application state / Backend Harness / shared Settings panes & theme React** → ui
- **VS Code extension / sidebar webview Host / extension↔webview IPC fulfillment** → vscode

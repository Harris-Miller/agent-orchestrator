# Architecture

HOA is a [Turborepo](https://turborepo.com/) + pnpm monorepo written in TypeScript on [Effect](https://effect.website/), with a [Tauri](https://v2.tauri.app/) desktop shell and a React UI.

```text
            you
             │
   ┌─────────▼──────────┐        ┌───────────────────┐
   │   Harness UI        │        │  VS Code webview  │
   │   (React, @lib/ui)  │        │  (same @lib/ui)   │
   └─────────┬──────────┘        └─────────┬─────────┘
             │  Agent Harness (ACP client)  │
             ├──────────────┬───────────────┤
        stdio│ JSON-RPC     │               │ MCP over HTTP
   ┌─────────▼───┐ ┌────────▼────┐   ┌──────▼──────┐
   │ codex-acp   │ │ claude-     │…  │     Hub      │◄── agents call
   │ (adapter)   │ │ agent-acp   │   │ (127.0.0.1)  │    Harness tools
   └─────────────┘ └─────────────┘   └─────────────┘
```

## Packages

| Package                                             | Role                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/desktop`                                      | The Tauri desktop app: hosts the Agent Harness and the Harness UI.                                        |
| `apps/vscode`                                       | The VS Code extension: extension-host side plus the webview that reuses the shared UI.                    |
| `libs/effect-acp`                                   | Effect implementation of the ACP wire protocol: schemas, stdio transport, connection lifecycle.           |
| `libs/ui`                                           | Shared Harness application state and React surfaces (sessions, composer, settings panes, themes).         |
| `libs/hoa-home`                                     | The only package that reads or writes `~/.hoa`: settings, Projects, Workstreams, per-launch-target files. |
| `libs/hub`                                          | The machine-wide MCP Hub process.                                                                         |
| `libs/context-services`                             | Portable host abstractions (OS, clipboard, bundled resources) as Effect services.                         |
| `libs/context-services-{node,tauri,vscode-webview}` | The live implementations of those services for each host.                                                 |

## Design rules worth knowing

- **ACP agents, not LLM SDKs.** The Harness never calls a model API. Everything an agent does comes through ACP, so a new agent is a new launch target, not a new integration.
- **Host services are swappable.** The UI and Harness depend on `context-services` interfaces; the desktop app and VS Code each provide their own live layer. That is how one UI runs in two hosts.
- **Nothing vendor-specific is bundled.** Provider runtimes are downloaded by the user into the HOA home and shared across hosts.

Architecture decisions are recorded as ADRs in the repository: system-wide in `docs/adr/`, and per package under each package's `docs/adr/`.

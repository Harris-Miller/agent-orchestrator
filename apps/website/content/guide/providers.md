# Agent providers

An **Agent provider** is an external coding-agent backend HOA can connect to. Every provider is reached as an ACP agent subprocess — never through an in-process SDK.

| Provider        | Launch target      | How HOA reaches it                                                                                            | Availability |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- | ------------ |
| **Codex**       | `codex-acp`        | ACP adapter [`codex-acp`](https://github.com/agentclientprotocol/codex-acp), installed with npm               | Available    |
| **Claude**      | `claude-agent-acp` | ACP adapter [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp), installed with npm | Available    |
| **Cursor**      | `cursor-acp`       | Cursor CLI's native ACP mode (`cursor-agent acp`) found on your `PATH`                                        | Beta flag    |
| **Antigravity** | `antigravity-acp`  | Managed ACP binary (`agy_acp_server`) that HOA downloads into the HOA home                                    | Beta flag    |

::: info Beta providers
Cursor and Antigravity are enabled by compile-time beta flags. Builds without those flags show only Codex and Claude.
:::

## Launch targets

A provider is the _name_ (Codex, Claude); a **launch target** is the _process_ HOA spawns for it. Sessions, pins and caches are stored per launch target. There are three kinds:

- **ACP adapter** — a stdio process that wraps a vendor CLI or SDK which is not ACP-native. Codex and Claude work this way.
- **Vendor CLI ACP** — a vendor CLI that speaks ACP itself. HOA spawns it directly from your `PATH` (Cursor).
- **Managed ACP agent** — an ACP binary HOA downloads and pins under `~/.hoa/` (Antigravity).

## Provider runtimes

A **provider runtime** is the program behind a launch target: an npm install of an adapter, or extracted binaries. HOA keeps each runtime under `~/.hoa/providers/<launch target>/runtime/<version>/`, and a `current.json` file records which downloaded version is active. Manage runtimes in **Settings › Providers**: download a new version, switch the active one, or delete old ones.

The desktop app and the VS Code extension share these runtimes — install once, use from both.

## Antigravity sign-in

Antigravity signs in with a personal Google account through OAuth. HOA keeps its credentials in `~/.hoa/providers/antigravity-acp/home/`; they are **not** shared with an `agy` or Gemini CLI login on your `PATH`.

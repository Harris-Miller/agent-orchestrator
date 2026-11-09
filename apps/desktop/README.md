# @apps/desktop

Tauri + React desktop application that hosts the **Agent Harness** — an ACP Client for driving external coding agents (Codex, Claude, Gemini) as subprocesses, without embedding any vendor LLM SDK.

The Harness spawns ACP Agent subprocesses (adapters downloaded by the user under `~/.hoa/providers/`, see [ADR 0017](./docs/adr/0017-user-installed-provider-runtimes.md), or native ACP CLIs like Cursor), negotiates capabilities, runs sessions, and fulfills Agent-initiated requests (filesystem, terminal, permissions) on the user's behalf. The React UI presents sessions, agent output, and permission prompts, driven by the Harness's domain state.

See [`GLOSSARY.md`](./GLOSSARY.md) for the domain glossary and [`docs/adr/`](./docs/adr/) for architecture decisions.

## Prerequisites

A global **Node >= 22** and **npm** (checked at startup; a blocking modal explains what is missing). Provider runtimes (`claude-agent-acp`, `codex-acp`, Antigravity) are downloaded from Settings > Providers into `~/.hoa/providers/<id>/`; nothing is bundled.

## Scripts

```sh
pnpm --filter=@apps/desktop dev              # Vite dev server (UI only)
pnpm --filter=@apps/desktop tauri:dev        # full desktop app
pnpm --filter=@apps/desktop test             # vitest
```

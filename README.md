# agent-orchestrator

Tauri + React desktop app that hosts the **Agent Harness** — an [ACP](https://agentclientprotocol.com/) Client for driving external coding agents (Codex, Claude, Gemini) as subprocesses, without embedding any vendor LLM SDK.

## Layout

- [`apps/desktop`](./apps/desktop) — the desktop app (Agent Harness + UI)
- [`libs/effect-acp`](./libs/effect-acp) — Effect library implementing the ACP wire protocol
- [`libs/context-services`](./libs/context-services) — portable host-environment abstractions (Effect services)
- [`libs/context-services-node`](./libs/context-services-node) — Node/Bun live layers for `context-services`
- [`libs/context-services-tauri`](./libs/context-services-tauri) — Tauri live layers for `context-services`
- [`tooling/`](./tooling) — shared ESLint, tsconfig, and Vitest config packages

See [`GLOSSARY-MAP.md`](./GLOSSARY-MAP.md) for per-package glossaries and how the packages relate.

## Getting started

```sh
pnpm install
pnpm run local-ci   # typecheck, lint, test — must pass before work is done
pnpm run tauri:dev  # run the desktop app
```

This is a [Turborepo](https://turborepo.com/) + pnpm workspaces monorepo. See [`AGENTS.md`](./AGENTS.md) for repo-specific agent conventions.

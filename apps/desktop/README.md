# @apps/desktop

Tauri + React desktop application that hosts the **Agent Harness** — an ACP Client for driving external coding agents (Codex, Claude, Gemini) as subprocesses, without embedding any vendor LLM SDK.

The Harness spawns ACP Agent subprocesses (adapters under [`acp-adapter-resources`](./acp-adapter-resources), or native ACP CLIs like Gemini), negotiates capabilities, runs sessions, and fulfills Agent-initiated requests (filesystem, terminal, permissions) on the user's behalf. The React UI presents sessions, agent output, and permission prompts, driven by the Harness's domain state.

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and [`docs/adr/`](./docs/adr/) for architecture decisions.

## Scripts

```sh
pnpm --filter=@apps/desktop dev              # Vite dev server (UI only)
pnpm --filter=@apps/desktop tauri:dev        # full desktop app
pnpm --filter=@apps/desktop test             # vitest
pnpm --filter=@apps/desktop materialize-acp-adapters  # install ACP adapter resources
```

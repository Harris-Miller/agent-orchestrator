# @lib/ui

Shared webview harness stack (Backend Harness Effects, phase atoms, session bootstrap) for Agent Orchestrator hosts (`apps/desktop`, `apps/vscode`). Apps compose Live Host Layers; this package does not import Tauri or `*Live` adapters.

## Scripts

```sh
pnpm --filter=@lib/ui test
pnpm --filter=@lib/ui typecheck
pnpm --filter=@lib/ui lint
```

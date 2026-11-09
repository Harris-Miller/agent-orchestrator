# @lib/ui

Shared webview harness stack (Backend Harness Effects, Bootstrap phase and Harness application state, session bootstrap) for Harness Orchestrating Agents hosts (`apps/desktop`, `apps/vscode`). Hosts compose Live Host Layers; this package does not import Tauri or `*Live` adapters.

## Scripts

```sh
pnpm --filter=@lib/ui test
pnpm --filter=@lib/ui typecheck
pnpm --filter=@lib/ui lint
```

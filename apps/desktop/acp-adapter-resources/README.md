# acp-adapter-resources

Isolated install of ACP adapter packages (`claude-agent-acp`, `codex-acp`) used as external Agent subprocesses by the [desktop](../) Agent Harness.

Deliberately **not** a pnpm workspace member — it has its own lockfile so its `node_modules` can be hoisted and bundled wholesale as Tauri resources, independent of the monorepo's dependency tree.

Install/refresh with:

```sh
pnpm --filter=@apps/desktop materialize-acp-adapters
```

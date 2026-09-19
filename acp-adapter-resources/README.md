# acp-adapter-resources

Isolated install of ACP adapter packages (`claude-agent-acp`, `codex-acp`) used as external Agent subprocesses by desktop (Tauri resources) and the VS Code extension (packaged tree).

Deliberately **not** a pnpm workspace member — own lockfile so `node_modules` can be hoisted and copied wholesale into each host’s package, independent of the monorepo dependency tree.

Install/refresh from the repo root:

```sh
pnpm materialize-acp-adapters
```

App scripts (`pnpm --filter=@apps/desktop materialize-acp-adapters`, vscode-extension alias) call the same root install.

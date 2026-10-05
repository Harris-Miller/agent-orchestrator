# acp-adapter-resources

Isolated install of ACP adapter packages (`claude-agent-acp`, `codex-acp`, and first-party `@lib/gemini-acp`) used as external Agent subprocesses by desktop (Tauri resources) and the VS Code extension (packaged tree).

Deliberately **not** a pnpm workspace member — own lockfile so `node_modules` can be hoisted and copied wholesale into each host’s package, independent of the monorepo dependency tree.

`@lib/gemini-acp` is a bundled Node entry materialized into `vendor/gemini-acp/` (gitignored) before install (`file:./vendor/gemini-acp`). Root `install-acp-adapter-deps` runs that materialize step, then `pnpm install --prod` here.

Install/refresh from the repo root:

```sh
pnpm install-acp-adapter-deps
```

App scripts (`pnpm --filter=@apps/desktop materialize-acp-adapters`, vscode alias) call the same root install.

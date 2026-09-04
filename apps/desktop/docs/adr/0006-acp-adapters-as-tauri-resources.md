# Ship ACP adapters as Tauri resources

The Agent Harness needs Codex and Claude ACP adapters at provider launch without a global `pnpm install -g @agentclientprotocol/…`. We ship a flattened adapter resource tree inside the Tauri application package (`tauri build` resources), materialize the same tree for `tauri:dev`, and spawn `node` on the adapter entry after detecting the user `codex` / `claude` vendor CLI on PATH (`CODEX_PATH` / `CLAUDE_CODE_EXECUTABLE`). We do not embed those vendor CLIs, and we do not use Tauri sidecars until a later need forces that.

Adapters live in an **isolated** pnpm project at `apps/desktop/acp-adapter-resources` (own lockfile / workspace — not a monorepo member) with `nodeLinker: hoisted` so `node_modules` is a flat real-directory tree. `beforeDev` / `beforeBuild` run `materialize-acp-adapters` (`pnpm install --prod` in that dir); Tauri bundles that `node_modules` as resources (isolated store symlinks would be dropped by the resource bundler).

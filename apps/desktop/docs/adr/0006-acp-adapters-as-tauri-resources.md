> **Superseded by [ADR 0017](0017-user-installed-provider-runtimes.md).** Adapters are no longer bundled; they are user-installed under `~/.hoa/providers/`. Kept for history.

# Ship ACP adapters as Tauri resources

The Agent Harness needs Codex and Claude ACP adapters at provider launch without a global `pnpm install -g @agentclientprotocol/…`. We ship a flattened adapter resource tree inside the Tauri application package (`tauri build` resources), materialize the same tree for `tauri:dev`, and spawn `node` on the adapter entry after detecting the user `codex` / `claude` vendor CLI on PATH (`CODEX_PATH` / `CLAUDE_CODE_EXECUTABLE`). We do not embed those vendor CLIs, and we do not use Tauri sidecars until a later need forces that.

Adapters live in an **isolated** pnpm project at repo-root `acp-adapter-resources/` (own lockfile / workspace — not a monorepo member; shared with the VS Code extension) with `nodeLinker: hoisted` so `node_modules` is a flat real-directory tree. Root `materialize-acp-adapters` (and the desktop alias) run `pnpm install --prod` in that dir; `beforeDev` / `beforeBuild` invoke the desktop alias. Tauri bundles that `node_modules` as resources from `../../../acp-adapter-resources/node_modules` (relative to `src-tauri/`; isolated store symlinks would be dropped by the resource bundler).

Native Vendor CLI ACP launch targets that need no adapter entry (e.g. `cursor-acp`) are covered by [ADR 0013](./0013-native-cli-acp-launch-targets.md); this ADR remains for Node ACP adapter shims only.

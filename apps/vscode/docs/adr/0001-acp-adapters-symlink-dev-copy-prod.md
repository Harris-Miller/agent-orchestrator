# Ship ACP adapters with the VS Code extension

> **Superseded by [desktop ADR 0017](../../../desktop/docs/adr/0017-user-installed-provider-runtimes.md).** The extension no longer ships or symlinks an adapter tree; runtimes are user-installed under `~/.hoa/providers/`. The symlink/copy scheme below is historical.

The extension Node host must spawn `node` on the same hoisted adapter entries as desktop (`claude-agent-acp`, `codex-acp`) without bundling those graphs into `dist/extension.cjs`. Adapters live in repo-root `acp-adapter-resources/` (shared, not owned by this app).

**Dev (Extension Development Host / F5):** Turbo `build` / `watch:main` depend on cacheable `materialize-acp-adapters` (inputs: root adapter lockfile + symlink script; output: package symlink). That installs at repo root and creates a gitignored symlink `apps/vscode/acp-adapter-resources` → `../../acp-adapter-resources`. Relative keys match Tauri (`acp-adapter-resources/node_modules/@agentclientprotocol/…/dist/index.js`); `ExtensionContext.asAbsolutePath` follows the symlink. Darwin symlink; Windows needs Developer Mode (no junction fallback).

**Prod (VSIX):** `vscode:prepublish` / `package` run `prepare-acp-adapters-for-package`: install at root, remove the symlink if present, wipe + `fs.cp` a real tree into the extension dir, then build and `vsce package --no-dependencies`. Copy is package-only so F5 does not pay for a full tree duplicate. `.vscodeignore` un-ignores `acp-adapter-resources/**` so the tree ships in the VSIX.

Missing entries fail only inside `resolveAcpAdapterEntry`, not at `activate()`.

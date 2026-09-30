# Agent Orchestrator (VS Code)

Local-development scaffold for the Agent Orchestrator VS Code extension.

Renders a React webview in the **Secondary Side Bar** (`viewsContainers.secondarySidebar`).

## ACP adapter resources

Adapters live at repo-root `acp-adapter-resources/` (shared with desktop). See [`docs/adr/0001-acp-adapters-symlink-dev-copy-prod.md`](./docs/adr/0001-acp-adapters-symlink-dev-copy-prod.md).

**Dev (F5):** before spawning adapters (or after lockfile changes):

```bash
pnpm --filter agent-orchestrator-vscode materialize-acp-adapters
```

That installs at repo root and symlinks `acp-adapter-resources` into this package. On Windows, enable Developer Mode so symlink creation works (no junction fallback).

**Prod (VSIX):** `pnpm --filter agent-orchestrator-vscode run package` copies a real tree into the extension (via `vscode:prepublish`); ordinary `build` / `watch` do not.

## Load locally (no Marketplace)

### 1. Extension Development Host (day-to-day)

From the monorepo root in Cursor/VS Code:

1. `pnpm vscode:watch` (or F5 — **Run Extension** starts watch via `preLaunchTask`)
2. `pnpm vscode:dev` / Run and Debug → **Run Extension**

That launches a new window with `--extensionDevelopmentPath=apps/vscode`.

- **Renderer** edits hot-reload via Vite (`watch:renderer`). Vite must be up in Extension Development Host or the webview scripts fail to load.
- **Host** (`extension.ts` / host code) edits need **Developer: Reload Window**.

Or from a terminal (watch already running):

```bash
pnpm vscode:watch   # terminal 1 — host + Vite HMR
pnpm vscode:dev     # terminal 2 — launch only
```

`pnpm vscode:build` + `pnpm vscode:dev` without Vite leaves the Development-mode webview blank until the renderer server is up.

Open **View: Toggle Secondary Side Bar Visibility** if needed. The Agent Orchestrator icon should appear there with the Hello, World webview.

### 2. Install a packaged `.vsix` (persistent install)

```bash
pnpm --filter agent-orchestrator-vscode run package
code --install-extension apps/vscode/agent-orchestrator-vscode-0.0.1.vsix
```

Also available via Extensions view → `...` → **Install from VSIX...**

Marketplace publish is not required for either path.

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

1. `pnpm vscode:build` (or `pnpm vscode:watch`)
2. Run and Debug → **Run Extension**

That launches a new window with `--extensionDevelopmentPath=apps/vscode-extension`.

Or from a terminal:

```bash
pnpm vscode:build
pnpm vscode:dev
```

Open **View: Toggle Secondary Side Bar Visibility** if needed. The Agent Orchestrator icon should appear there with the Hello, World webview.

### 2. Install a packaged `.vsix` (persistent install)

```bash
pnpm --filter agent-orchestrator-vscode run package
code --install-extension apps/vscode-extension/agent-orchestrator-vscode-0.0.1.vsix
```

Also available via Extensions view → `...` → **Install from VSIX...**

Marketplace publish is not required for either path.

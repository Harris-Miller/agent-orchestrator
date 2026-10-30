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

**F5 / Run Extension** (from Cursor or VS Code): starts watch, opens a **VS Code** Extension Development Host with `--inspect-brk-extensions=5870`, then attaches the Node debugger so host `.ts` breakpoints work. (`extensionHost` launch type always uses the _current_ editor, so it is not used here.)

1. F5 → **Run Extension**
2. Or without debugger: `pnpm vscode:dev` then `pnpm vscode:open`

Webview HTML mode is compile-time from the host bundle: `watch:main` injects Vite HMR (`localhost:5173`); `build:main` serves disk `dist/webview` assets. So `vscode:build` + `vscode:open` works without Vite; HMR needs `vscode:dev` (or F5).

- **Renderer** edits hot-reload via Vite (`watch:renderer`) when the host was built with `watch:main`.
- **Host** (`extension.ts` / host code) edits need **Developer: Reload Window**. After reload, re-run **Run Extension** (or re-attach to port 5870) if breakpoints stop binding — reload can drop the inspect session.

Or from a terminal (watch already running):

```bash
pnpm vscode:dev     # terminal 1 — host (HMR flag) + Vite
pnpm vscode:open    # terminal 2 — launch only (no debugger)
```

Open **View: Toggle Secondary Side Bar Visibility** if needed. The Agent Orchestrator icon should appear there with the Hello, World webview.

### 2. Install a packaged `.vsix` (persistent install)

```bash
pnpm --filter agent-orchestrator-vscode run package
code --install-extension apps/vscode/agent-orchestrator-vscode-0.0.1.vsix
```

Also available via Extensions view → `...` → **Install from VSIX...**

Marketplace publish is not required for either path.

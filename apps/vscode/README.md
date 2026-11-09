# Harness Orchestrating Agents (VS Code)

Local-development scaffold for the Harness Orchestrating Agents VS Code extension.

Renders a React webview in the **Secondary Side Bar** (`viewsContainers.secondarySidebar`).

## Provider runtimes

The extension bundles no ACP adapters. A global **Node >= 22** and **npm** are required (a blocking modal shows what is missing); runtimes are downloaded from Settings > Providers into `~/.hoa/providers/<id>/` and selected by `current.json`, shared with the desktop app. See [desktop ADR 0017](../desktop/docs/adr/0017-user-installed-provider-runtimes.md). The VSIX contains no `acp-adapter-resources`.

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

Open **View: Toggle Secondary Side Bar Visibility** if needed. The Harness Orchestrating Agents icon should appear there with the Hello, World webview.

### 2. Install a packaged `.vsix` (persistent install)

```bash
pnpm --filter hoa-vscode run package
code --install-extension apps/vscode/hoa-vscode.vsix
```

Also available via Extensions view → `...` → **Install from VSIX...**

The `.vsix` is stamped with the desktop app version (`apps/desktop/src-tauri/tauri.conf.json`), not this package's `version`. The desktop app bundles it (`pnpm --filter @apps/desktop run tauri:build`) and offers to install or update it in VS Code from the Providers modal and Settings > Providers; see ADR 0019 in `apps/desktop/docs/adr`.

Marketplace publish is not required for either path.

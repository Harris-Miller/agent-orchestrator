# Agent Orchestrator (VS Code)

Local-development scaffold for the Agent Orchestrator VS Code extension.

Renders a React webview in the **Secondary Side Bar** (`viewsContainers.secondarySidebar`).

## Load locally (no Marketplace)

### 1. Extension Development Host (day-to-day)

From the monorepo root in Cursor/VS Code:

1. `pnpm --filter agent-orchestrator-vscode run compile` (or start `watch`)
2. Run and Debug → **Run Extension** (F5)

That launches a new window with `--extensionDevelopmentPath=apps/vscode-extension`.

Or from a terminal:

```bash
pnpm --filter agent-orchestrator-vscode run compile
code --extensionDevelopmentPath="$PWD/apps/vscode-extension"
```

Open **View: Toggle Secondary Side Bar Visibility** if needed. The Agent Orchestrator icon should appear there with the Hello, World webview.

### 2. Install a packaged `.vsix` (persistent install)

```bash
pnpm --filter agent-orchestrator-vscode run package
code --install-extension apps/vscode-extension/agent-orchestrator-vscode-0.0.1.vsix
```

Also available via Extensions view → `...` → **Install from VSIX...**

Marketplace publish is not required for either path.

# Agent Orchestrator (VS Code)

Local-development scaffold for the Agent Orchestrator VS Code extension.

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

### 2. Install a packaged `.vsix` (persistent install)

```bash
pnpm --filter agent-orchestrator-vscode run package
code --install-extension apps/vscode-extension/agent-orchestrator-vscode-0.0.1.vsix
```

Also available via Extensions view → `...` → **Install from VSIX...**

Marketplace publish is not required for either path.

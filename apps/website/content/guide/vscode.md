# VS Code extension

HOA's VS Code extension renders the same Harness UI in VS Code's **Secondary Side Bar**. It runs agents from the extension host and shares the HOA home with the desktop app: the same provider runtimes, Projects and settings.

## Install

The extension is not on the Marketplace. The desktop app ships it inside its bundle and offers to install or update it — from the Providers modal and from **Settings › Providers** — using the `code` CLI. The bundled extension is always the same version as the desktop app.

To install it by hand from a source checkout:

```sh
pnpm --filter hoa-vscode run package
code --install-extension apps/vscode/hoa-vscode.vsix
```

Then run **View: Toggle Secondary Side Bar Visibility** if the HOA view isn't showing.

## Differences from the desktop app

- The workspace folder becomes a Project the first time you start a session there.
- **Match VS Code theme** makes the UI use your editor's colors (the HOA theme preference still picks file icons).
- Handoff and subagents are unavailable in remote windows (SSH, containers), because the Hub runs on your local machine.

## Requirements

The same as the desktop app: a global Node ≥ 22 and npm. Provider runtimes are not bundled in the `.vsix`; download them from Settings › Providers.

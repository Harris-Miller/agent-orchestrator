# Matching the VS Code theme is a Host theme beside the Theme preference, not a Theme id

Issue #334 makes the Harness UI follow the active VS Code color theme. We model it as a separate boolean User setting (`matchVscodeTheme`, on when unset) and a Host theme the VS Code webview writes into a shared atom, instead of adding a `vscode` Theme id. Desktop and VS Code share `~/.hoa/settings.json`, so a `vscode` Theme id chosen in VS Code would overwrite the desktop's Theme preference, and the override must apply in VS Code only. The Theme preference therefore keeps its value and keeps choosing the file-icon set while the colors come from VS Code.

## Considered options

- **Read the extension's theme JSON from disk in the extension host:** rejected because it would re-implement VS Code's color resolution (JSONC, `include` chains, registry defaults the extension cannot read) and add a Host IPC message, for fewer and less correct colors than the `--vscode-*` variables VS Code already writes into the webview.
- **MUI CSS-variables theme with `var(--vscode-*)` palette entries:** rejected because every JS `alpha`/`darken` call would throw on a `var()`, and it would switch both Hosts to MUI's CSS-variable mode for a VS Code-only feature.

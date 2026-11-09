# Bundled VS Code extension, installed locally by the desktop app

For alpha the HOA VS Code extension is **not published** to the VS Code Marketplace or Open VSX. The desktop Bundle ships the `.vsix`, stamped with the desktop app version, and the desktop app installs it with the VS Code CLI on user consent. VS Code never auto-updates a local `.vsix` install, so the app compares the installed version with the bundled one and offers an update; the extension therefore moves in lockstep with the desktop app.

## Decisions

- **Version.** One version: the desktop app version is stamped into the `.vsix` at build time. `tauri build` depends on the `hoa-vscode` package task and bundles the result as a resource. In `tauri dev` the resource is absent and the install UI is hidden.
- **Install state.** The app reads `code --list-extensions --show-versions` (id `harris-miller.hoa-vscode`) and compares semver with the bundled version: `not-installed`, `up-to-date`, `outdated`, `newer-installed`. Install and Update both run `--install-extension <vsix> --force`; a downgrade is never offered. After install the app only reports success and that open VS Code windows need **Reload Window**.
- **Finding the CLI.** `code` on PATH, then the CLI inside the VS Code app bundle at the standard per-OS path (a GUI-launched app often has a minimal PATH), then, if VS Code is detected but no CLI works, manual steps: the absolute `.vsix` path with a Copy button and "Install from VSIX...". macOS, Windows and Linux paths are written; only macOS is verified by hand. Stable VS Code only; other editors (Cursor, Insiders, VSCodium) are deferred behind the same lookup seam.
- **Where it shows.** A desktop-only row in the startup Providers modal and in Settings > Providers, hidden when VS Code is not detected. Updates use a separate launch-time dialog (Update / Not now / Skip this version) so they do not depend on "Show Providers on startup"; the skipped version is stored in User settings.
- **Native boundary.** A constrained Rust command, in the style of `spawn_antigravity_provider`, resolves the CLI and the bundled `.vsix` itself and accepts no executable path or arguments from the webview. It supports only detect, list installed version, and install the bundled `.vsix`. Shell-scope entries do not fit because the CLI path varies per machine.
- **Out of scope.** Uninstall and any VS Code extension surface inside the VS Code webview.

## Considered options

- **Publish to Marketplace / Open VSX:** independent extension and app versions and VS Code auto-update, but publisher accounts and a release pipeline before there is an alpha to ship.
- **Static shell-scope commands (ADR 0017 style):** cannot express the per-machine CLI path.
- **Silent auto-update:** installs into the user's editor without consent.

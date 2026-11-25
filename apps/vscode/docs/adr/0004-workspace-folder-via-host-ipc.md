# Workspace folder paths via Host IPC, not OS snapshot cwd

The sidebar Session cwd comes from VS Code Workspace folder absolute paths. Those are delivered over Host IPC as their own capability. OS snapshot `cwd` stays the extension-host process cwd and must not be overloaded with workspace roots — the two concepts are different, and conflating them would break anything that needs real process cwd while also hiding IDE multi-root semantics.

## Additional directories and the workspace file

The same Host IPC capability (request and change push) also carries the saved workspace's `.code-workspace` path, omitted for an untitled workspace or any non-`file:` scheme. The webview takes the other `file:` folders as a new session's Additional directories; the first folder stays the Session cwd. OS snapshot `cwd` is still not overloaded. The Project is unchanged: only the Workspace cwd is added to `projects.json`; neither the workspace file nor the Additional directories are written there (see hoa-home ADR 0009).

The workspace file is metadata captured when a Bind is requested and recorded on the created session; it is not part of the Bind key (only the folder set is). Saving an untitled workspace changes only the workspace file; it enters a workspace and restarts the extension host (below), so the webview boots with the final value.

### One folder to two (documented from VS Code source, not observed in a running VS Code)

The source citations below were read from microsoft/vscode `main` at implementation time and not re-verified against the VS Code version users run.

- `@types/vscode` documents only that adding, removing or changing the **first** workspace folder terminates and restarts the extension host (so the deprecated `rootPath` is updated) and that `onDidChangeWorkspaceFolders` does not fire then. It says nothing about a single-folder to multi-root transition; that claim rests on the two source files below.
- `src/vs/workbench/services/workspaces/browser/abstractWorkspaceEditingService.ts`: `updateFolders` on a single-folder workspace calls `createAndEnterWorkspace(foldersToAdd)`, then `enterWorkspace`.
- `src/vs/workbench/services/workspaces/electron-browser/workspaceEditingService.ts`: `enterWorkspace()` calls `extensionService.stopExtensionHosts("Opening a multi-root workspace")`, enters the workspace, then `startExtensionHosts()` (remote windows: `hostService.reload()`), commenting "Restart the extension host: entering a workspace means a new location for storage and potentially a change in the workspace.rootPath property."

What that means here:

- **1 → 2 folders, or a changed first folder:** the extension host restarts and the webview boots fresh with the final folder set. The in-memory Virtual blob and Active sessions die with it, so there is nothing to reconcile.
- **Already in a workspace, folders added or removed with the first unchanged (e.g. 2 → 3):** no restart; `onDidChangeWorkspaceFolders` fires. Active sessions stay up, the next create/activate uses the new set, and a Virtual blob on the Workspace cwd takes the new list (a Bound Virtual re-Binds).

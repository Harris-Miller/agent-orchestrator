# Workspace folder paths via Host IPC, not OS snapshot cwd

The sidebar Session cwd comes from VS Code Workspace folder absolute paths. Those are delivered over Host IPC as their own capability. OS snapshot `cwd` stays the extension-host process cwd and must not be overloaded with workspace roots — the two concepts are different, and conflating them would break anything that needs real process cwd while also hiding IDE multi-root semantics.

## Additional directories and the workspace file

The same Host IPC capability (request and change push) also carries the saved workspace's `.code-workspace` path, omitted for an untitled workspace or any non-`file:` scheme. The webview takes the other `file:` folders as a new session's Additional directories; the first folder stays the Session cwd. OS snapshot `cwd` is still not overloaded. The Project is exactly the Workspace cwd: only it is added to `projects.json`, while the workspace file and the Additional directories belong to each Tracked session and are never written there (see hoa-home ADR 0009). Whether a saved workspace file should itself become the Project is tracked in #502.

The workspace file is metadata captured when a Bind is requested and recorded on the created session; it is not part of the Bind key (only the folder set is). Saving an untitled workspace goes through `saveAndEnterWorkspace` -> `enterWorkspace` in `src/vs/workbench/services/workspaces/browser/abstractWorkspaceEditingService.ts`, which restarts the extension host, so the webview boots with the saved workspace file. A workspace-file-only change updates the Bound session in place and never rebinds. The window's live folders (not a re-read of the `.code-workspace` file) decide a VS Code session's Additional directories (see #502).

### One folder to two (documented from VS Code source, not observed in a running VS Code)

The source citations below were read from microsoft/vscode `main` at implementation time and not re-verified against the VS Code version users run.

- `@types/vscode` documents that adding, removing or changing the **first** workspace folder terminates and restarts the extension host (so the deprecated `rootPath` is updated) and that `onDidChangeWorkspaceFolders` does not fire then (`onDidChangeWorkspaceFolders` note). The `updateWorkspaceFolders` note names "transitioning from an empty or single-folder workspace into a multi-folder workspace" as another restart case.
- `src/vs/workbench/services/workspaces/browser/abstractWorkspaceEditingService.ts`: `updateFolders` on a single-folder workspace calls `createAndEnterWorkspace(foldersToAdd)`, then `enterWorkspace`.
- `src/vs/workbench/services/workspaces/electron-browser/workspaceEditingService.ts`: `enterWorkspace()` calls `extensionService.stopExtensionHosts("Opening a multi-root workspace")`, enters the workspace, then `startExtensionHosts()` (remote windows: `hostService.reload()`), commenting "Restart the extension host: entering a workspace means a new location for storage and potentially a change in the workspace.rootPath property."

What that means here:

- **A plain folder window (not a workspace) going to two folders:** it enters workspace mode (`updateFolders` -> `createAndEnterWorkspace` -> `enterWorkspace`), which stops and restarts the extension host. The webview boots fresh with the final folder set, so the in-memory Virtual blob and Active sessions die with it and there is nothing to reconcile.
- **A changed first folder:** restart, per `@types/vscode`; same fresh boot. The Session cwd is the first `file:` folder (non-`file:` folders are dropped before the split), so when a non-`file:` folder is first in the window, VS Code's "first folder changed" restart can happen without the Session cwd changing; this is harmless because boot recomputes everything from the final folder list.
- **A window that is already a workspace (including a saved `.code-workspace` holding one folder), 1 → 2 or 2 → 3 with the first folder unchanged:** no restart; `onDidChangeWorkspaceFolders` fires and the same-first-folder path handles it. Active sessions stay up, the next create/activate uses the new set, a Virtual blob on the Workspace cwd takes the new list, and a Bound Virtual re-Binds. Inferred from the sources above and the `@types/vscode` `onDidChangeWorkspaceFolders` note, not observed.

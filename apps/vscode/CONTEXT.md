# vscode

VS Code extension Host app: extension-host fulfillment plus webview that presents Host services to shared Harness UI.

## Language

**Extension host**:
The Node VS Code extension process that fulfills spawn, filesystem, BundledResource, and OS snapshot behind Host IPC (extension↔webview wire).

**Webview**:
The sidebar webview that boots `makeHostServicesLive`, binds the Host runtime, and presents the sidebar Harness UI (Session History, Chat, and secondary Providers access).
_Avoid_: panel, iframe (when you mean this view)

**Workspace folder**:
One root folder in the VS Code workspace. Its absolute filesystem path is the only Session cwd the sidebar Harness UI may create or show sessions for (when several Workspace folders exist, the first in VS Code’s list). Distinct from OS snapshot `cwd` (extension-host process cwd).
_Avoid_: OS cwd, Host cwd, workspace root, project root (when you mean this VS Code root)

**Session History**:
The sidebar view that lists Session roster rows for the current Workspace folder Session cwd and can create a new session against that path. On the vscode TanStack router this is the `/` route; shown when there is no Selected session.
_Avoid_: Session roster (the harness data), nav rail, chats list

**Chat**:
The sidebar view that shows the Selected session’s transcript and composer (same Harness behavior as desktop main chat). On the vscode TanStack router this is `/session/$sessionId`; entering it selects/activates that session, and back navigates to Session History (`/`) and clears the Selected session.
_Avoid_: Main chat, AgentChatMain, conversation pane

For Host / Host services / Host IPC vocabulary, see [`../../libs/context-services/CONTEXT.md`](../../libs/context-services/CONTEXT.md) and [`../../libs/context-services-vscode-webview/CONTEXT.md`](../../libs/context-services-vscode-webview/CONTEXT.md). For Session cwd / Session roster / Selected session / Active session, see [`../desktop/CONTEXT.md`](../desktop/CONTEXT.md).

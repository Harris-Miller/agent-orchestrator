# vscode

VS Code extension Host app: extension-host fulfillment plus webview that presents Host services to shared Harness UI.

## Language

**Extension host**:
The Node VS Code extension process that fulfills spawn, filesystem, BundledResource, OpenFile, OS snapshot, window focus (`WindowFocus`, for Notifier), and HTTP fetch behind Host IPC (extension↔webview wire). OpenFile opens files (jumping to an optional 1-based line), reveals directories, and opens image data by writing it to `<tmpdir>/hoa-images/<sha256-prefix>.<ext>`. In Extension Development it may load host `OTEL_*` development defaults into process env so they reach the webview via OS snapshot.

**Host IPC fulfillment**:
The extension host's side of Host IPC for one webview: an answer for every Host IPC request (its Result, or an Error when the work fails) and handling for every webview→extension Host IPC push. Anything else it receives is ignored, never answered.
_Avoid_: host handler, message switch

**Editor-mediated file access**:
The extension host's fulfillment of the EditorFiles Host service through VS Code documents, so reads see unsaved editor content.
_Avoid_: Host filesystem (the disk-only Seam)

**Webview**:
The sidebar webview that boots `makeHostServicesLive`, binds the Host runtime, and presents the sidebar Harness UI (Session History, Chat, and Settings).
_Avoid_: panel, iframe (when you mean this view)

**Workspace folder**:
One root folder in the VS Code workspace. Distinct from OS snapshot `cwd` (extension-host process cwd).
_Avoid_: OS cwd, Host cwd, workspace root, project root (when you mean this VS Code root)

**Workspace cwd**:
The absolute path the sidebar treats as the project cwd — the first Workspace folder’s path when folders exist, else absent. vscode-only; not a desktop concept. When present, it is the Session cwd for create and Import (the user cannot pick another). The other Workspace folders are **Additional directories**. The first time a session is tracked under it (a Virtual session materializes, or an Import is confirmed), it also becomes a Project if it is not one already.
_Avoid_: Session cwd (when you mean this vscode binding), OS cwd, Host cwd

**Additional directories**:
Absolute directories handed to the Agent beyond the Session cwd, sent only when the Agent advertises support. The same concept as on desktop (see the desktop glossary). A new session here gets the other Workspace folders (every folder after the **Workspace cwd**) as its Additional directories; a Tracked session keeps the list it was created with, whatever the workspace holds later.
_Avoid_: Workspace folder (the VS Code root folder), extra roots

**Workspace file**:
The `.code-workspace` file of a saved multi-root or single-folder VS Code workspace, recorded with a new session's **Additional directories** (see the desktop glossary). An untitled workspace has none.
_Avoid_: VS Code workspace (when you mean this file)

**Session History**:
The sidebar presentation of Session History (see desktop glossary), filtered to Tracked sessions for the current Workspace cwd whether or not that cwd is a Project (stopping tracking it on desktop does not hide them here), archived ones only when Show archived is on while browsing. An Import button in its header (hidden without a Workspace cwd) opens **Import** for the Workspace cwd. Session History search includes archived entries regardless of that toggle. On the vscode TanStack router this is the `/` shell when Selected is unset (Settings redirects from `/settings` to `/settings/general` and uses the shared responsive SettingsShell). Pinned entries for the Workspace cwd render once in a Pinned section above the rest (see desktop glossary). Create (+) ensures a Virtual session with Workspace cwd. With no Workspace cwd, History stays empty and no Virtual is created.
_Avoid_: Roster, Session roster, nav rail, chats list

**Chat**:
The sidebar view that shows Virtual or Selected Session transcript/composer (same Harness behavior as desktop main chat). Shown on `/` when Selected is Virtual or Session (not a separate URL). Boot / webview restart with a Workspace cwd ensures Virtual and lands on Chat even if Session History is nonempty. Empty Virtual Chat shows Recent sessions. The Session History button clears Selected (Virtual blob kept when the Composer has content, else discarded); first-path folder churn patches Virtual cwd or discards the blob when cwd is gone.
_Avoid_: Main chat, AgentChatMain, conversation pane

**Recent sessions**:
The up-to-5 newest unarchived Session History entries for the Workspace cwd, listed in an empty Virtual Chat; never archived ones, whatever Show archived says. None → blank Chat body.
_Avoid_: Session History (when you mean this short list), recents

For Host / Host services / Host IPC vocabulary, see [`../../libs/context-services/GLOSSARY.md`](../../libs/context-services/GLOSSARY.md) and [`../../libs/context-services-vscode-webview/GLOSSARY.md`](../../libs/context-services-vscode-webview/GLOSSARY.md). For Session cwd / Session History / Virtual session / Selected / Active session / Session header / Session actions, see [`../desktop/GLOSSARY.md`](../desktop/GLOSSARY.md).

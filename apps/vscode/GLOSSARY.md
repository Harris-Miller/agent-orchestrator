# vscode

VS Code extension Host app: extension-host fulfillment plus webview that presents Host services to shared Harness UI.

## Language

**Extension host**:
The Node VS Code extension process that fulfills spawn, filesystem, BundledResource, OpenFile, OS snapshot, and HTTP fetch behind Host IPC (extension↔webview wire). OpenFile opens files, reveals directories, and opens image data by writing it to `<tmpdir>/agent-orchestrator-images/<sha256-prefix>.<ext>`. In Extension Development it may load host `OTEL_*` development defaults into process env so they reach the webview via OS snapshot.

**Webview**:
The sidebar webview that boots `makeHostServicesLive`, binds the Host runtime, and presents the sidebar Harness UI (Session History, Chat, and Settings).
_Avoid_: panel, iframe (when you mean this view)

**Workspace folder**:
One root folder in the VS Code workspace. Distinct from OS snapshot `cwd` (extension-host process cwd).
_Avoid_: OS cwd, Host cwd, workspace root, project root (when you mean this VS Code root)

**Workspace cwd**:
The absolute path the sidebar treats as the project cwd — the first Workspace folder’s path when folders exist, else absent. vscode-only; not a desktop concept. When present, it is the Session cwd for list/create/load (the user cannot pick another).
_Avoid_: Session cwd (when you mean this vscode binding), OS cwd, Host cwd

**Session History**:
The sidebar presentation of Session History (see desktop glossary), filtered to History entries for the current Workspace cwd. On the vscode TanStack router this is the `/` shell when Selected is unset (Settings is `/settings` with list→detail category routes). Create (+) ensures a Virtual session with Workspace cwd. With no Workspace cwd, History stays empty and no Virtual is created.
_Avoid_: Roster, Session roster, nav rail, chats list

**Chat**:
The sidebar view that shows Virtual or Selected Session transcript/composer (same Harness behavior as desktop main chat). Shown on `/` when Selected is Virtual or Session (not a separate URL). Boot / webview restart with a Workspace cwd ensures Virtual and lands on Chat even if Session History is nonempty. Empty Virtual Chat lists up to 5 most-recent Session History entries for the Workspace cwd (none → blank). Back clears Selected (Virtual blob kept until process restart); first-path folder churn patches Virtual cwd or discards the blob when cwd is gone.
_Avoid_: Main chat, AgentChatMain, conversation pane

For Host / Host services / Host IPC vocabulary, see [`../../libs/context-services/GLOSSARY.md`](../../libs/context-services/GLOSSARY.md) and [`../../libs/context-services-vscode-webview/GLOSSARY.md`](../../libs/context-services-vscode-webview/GLOSSARY.md). For Session cwd / Session History / Virtual session / Selected / Active session, see [`../desktop/GLOSSARY.md`](../desktop/GLOSSARY.md).

# context-services-vscode-webview

VS Code webview live layers and Host IPC codec for `@lib/context-services`. The webview is the Host: it presents Host services to shared Harness code. The extension host fulfills Node capabilities behind the wire.

## Language

**Host IPC** (also: extension↔webview IPC):
The message protocol between the webview Host services Live and the VS Code extension-host fulfillment (control JSON plus transferable stdio bytes). Prefer **Host IPC** when speaking generically across Hosts (Tauri, VS Code webview, …); **extension↔webview IPC** when naming this Host’s wire specifically.
_Avoid_: RPC (when you mean this wire)

**Host IPC request**:
A webview→extension Host IPC message that gets exactly one reply: its own Result, or an Error. It is not a Host services capability: one capability may need several requests (FileSystem uses many), and some requests serve none (Workspace folders, app exit). The Workspace folders request also returns the workspace file of a saved workspace, when there is one.
_Avoid_: capability, command, RPC call (when you mean one request/Result pair)

**Host IPC push**:
A one-way Host IPC message that gets no reply: webview→extension stdin chunks and stdin end; extension→webview stdout/stderr chunks, stream ends, process exit, and Workspace folder changes (which carry the workspace file too, when there is one).
_Avoid_: event, notification (the latter is a Notifier term)

**OS snapshot**:
The webview's frozen OS values (`cwd`, `env`, `homedir`, `platform`) captured once from the extension host when the Host services Live is built.
_Avoid_: live process env, workspace folder (when you mean `OS.cwd`)

**Clipboard live layer**:
The webview implementation of Clipboard (`ClipboardLive`), wrapping `navigator.clipboard` text APIs — not carried over Host IPC.
_Avoid_: navigator.clipboard (when you mean the portable Seam)

**FileDialog live layer**:
The webview implementation of FileDialog (`makeFileDialogLive`), Host IPC round-trip to extension `showOpenDialog`.
_Avoid_: showOpenDialog (when you mean the portable Seam)

**VS Code Host services Live**:
The webview Live Adapter of portable **Host services** (`makeHostServicesLive`) — BundledResource, ChildProcessSpawner, Clipboard, FileDialog, FileSystem, Notifier, OpenFile, OpenUrl, OS, and Path over Host IPC (plus local Clipboard/Path). Composition may also install host ConfigProvider and OTLP observability (dev **Build target** only; OTLP HTTP via Host-IPC fetch); those extras are not part of the Host services type.
_Avoid_: Platform layer, adapters, Host services (when you mean this webview Adapter specifically)

For host vocabulary (`Clipboard`, `FileDialog`, `Notifier`, `Host`, `Host services`), see [`../context-services/GLOSSARY.md`](../context-services/GLOSSARY.md).

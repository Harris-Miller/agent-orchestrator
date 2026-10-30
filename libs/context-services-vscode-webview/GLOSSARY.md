# context-services-vscode-webview

VS Code webview live layers and Host IPC codec for `@lib/context-services`. The webview is the Host: it presents Host services to shared Harness code. The extension host fulfills Node capabilities behind the wire.

## Language

**Host IPC** (also: extension↔webview IPC):
The message protocol between the webview Host services Live and the VS Code extension-host fulfillment (control JSON plus transferable stdio bytes). Prefer **Host IPC** when speaking generically across Hosts (Tauri, VS Code webview, …); **extension↔webview IPC** when naming this Host’s wire specifically.
_Avoid_: RPC (when you mean this wire)

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
The webview Live Adapter of portable **Host services** (`makeHostServicesLive`) — BundledResource, ChildProcessSpawner, Clipboard, FileDialog, FileSystem, OpenFile, OpenUrl, OS, and Path over Host IPC (plus local Clipboard/Path). Composition may also install host ConfigProvider and optional OTLP observability (OTLP HTTP via Host-IPC fetch); those extras are not part of the Host services type.
_Avoid_: Platform layer, adapters, Host services (when you mean this webview Adapter specifically)

For host vocabulary (`Clipboard`, `FileDialog`, `Host`, `Host services`), see [`../context-services/GLOSSARY.md`](../context-services/GLOSSARY.md).

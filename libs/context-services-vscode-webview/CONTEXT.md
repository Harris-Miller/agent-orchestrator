# context-services-vscode-webview

VS Code webview live layers and extension↔webview IPC codec for `@lib/context-services`. The webview is the Host: it presents Host services to shared Harness code. The extension host fulfills Node capabilities behind the wire.

## Language

**Extension↔webview IPC**:
The message protocol between the webview Host services Live and the VS Code extension-host fulfillment (control JSON plus transferable stdio bytes).
_Avoid_: Host IPC, RPC (when you mean this wire)

**OS snapshot**:
The webview's frozen OS values (`cwd`, `env`, `homedir`, `platform`) captured once from the extension host when the Host services Live is built.
_Avoid_: live process env, workspace folder (when you mean `OS.cwd`)

**Clipboard live layer**:
The webview implementation of Clipboard (`ClipboardLive`), wrapping `navigator.clipboard` text APIs — not carried over extension↔webview IPC.
_Avoid_: navigator.clipboard (when you mean the portable Seam)

For host vocabulary (`Clipboard`, `Host`, `Host services`), see [`../context-services/CONTEXT.md`](../context-services/CONTEXT.md).

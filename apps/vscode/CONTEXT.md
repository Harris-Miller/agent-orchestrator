# vscode

VS Code extension Host app: extension-host fulfillment plus webview that presents Host services to shared Harness UI.

## Language

**Extension host**:
The Node VS Code extension process that fulfills spawn, filesystem, BundledResource, and OS snapshot behind Host IPC (extension↔webview wire).

**Webview**:
The sidebar webview that boots `makeHostServicesLive`, binds the Host runtime, and mounts shared Providers UI.
_Avoid_: panel, iframe (when you mean this view)

For Host / Host services / Host IPC vocabulary, see [`../../libs/context-services/CONTEXT.md`](../../libs/context-services/CONTEXT.md) and [`../../libs/context-services-vscode-webview/CONTEXT.md`](../../libs/context-services-vscode-webview/CONTEXT.md).

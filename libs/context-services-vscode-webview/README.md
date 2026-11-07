# @lib/context-services-vscode-webview

VS Code webview Host services Live and Host IPC codec for portable Host services in [`@lib/context-services`](../context-services).

Owns:

- Host IPC protocol (`./protocol`), shared with the extension host and free of `vscode` imports: the Host IPC request table (`HostIpcRequests`, each request paired with its Result) and the tagged-JSON codec derived from it, `IpcClient` (webview end: typed `request`, push routing) and `serveHostIpc` (extension end: decode, dispatch to a complete `HostIpcFulfillment` map, Result/`Error` replies)
- `connectFakePeers` (`./testing`): in-memory `IpcPort` pair for round-trip tests of either end
- `makeHostServicesLive()` — IPC clients + OS snapshot + Path + FileDialog + `ClipboardLive` (`navigator.clipboard`, `acquireVsCodeApi` inside the package)

See [`GLOSSARY.md`](./GLOSSARY.md) for the domain glossary. App mount / Providers UI live in `apps/vscode` + `@lib/ui` (issue #83).

## Scripts

```sh
pnpm --filter=@lib/context-services-vscode-webview test
pnpm --filter=@lib/context-services-vscode-webview typecheck
```

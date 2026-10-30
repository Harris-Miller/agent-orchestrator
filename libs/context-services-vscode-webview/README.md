# @lib/context-services-vscode-webview

VS Code webview Host services Live and Host IPC codec for portable Host services in [`@lib/context-services`](../context-services).

Owns:

- Protocol codec (custom tagged JSON + correlation ids) shared with the extension host (types/codec only)
- `makeHostServicesLive()` — IPC clients + OS snapshot + Path + FileDialog + `ClipboardLive` (`navigator.clipboard`, `acquireVsCodeApi` inside the package)

See [`GLOSSARY.md`](./GLOSSARY.md) for the domain glossary. App mount / Providers UI live in `apps/vscode` + `@lib/ui` (issue #83).

## Scripts

```sh
pnpm --filter=@lib/context-services-vscode-webview test
pnpm --filter=@lib/context-services-vscode-webview typecheck
```

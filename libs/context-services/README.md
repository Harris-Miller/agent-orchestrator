# @lib/context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

Defines portable Host services (`OS`, `BundledResource`, `Clipboard`, plus Effect `Path` / `FileSystem` / `ChildProcessSpawner` tags in the aggregate) as interfaces only. Live implementations are provided by [`@lib/context-services-node`](../context-services-node), [`@lib/context-services-tauri`](../context-services-tauri), and [`@lib/context-services-vscode-webview`](../context-services-vscode-webview).

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary.

## Scripts

```sh
pnpm --filter=@lib/context-services test
pnpm --filter=@lib/context-services typecheck
```

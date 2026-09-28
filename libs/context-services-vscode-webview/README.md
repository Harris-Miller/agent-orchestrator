# @lib/context-services-vscode-webview

Browser / VS Code webview live layers for portable Host services in [`@lib/context-services`](../context-services).

Currently exports `ClipboardLive` (`navigator.clipboard`). Full Host Live merge lands with VS Code Host IPC.

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary.

## Scripts

```sh
pnpm --filter=@lib/context-services-vscode-webview test
pnpm --filter=@lib/context-services-vscode-webview typecheck
```

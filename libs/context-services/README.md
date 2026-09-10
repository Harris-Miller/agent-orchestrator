# @lib/context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

Defines the `OS` service — current working directory, allowlisted environment variables, home directory, and platform identifier — as an interface only. Live implementations are provided by [`@lib/context-services-node`](../context-services-node) and [`@lib/context-services-tauri`](../context-services-tauri).

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary.

## Scripts

```sh
pnpm --filter=@lib/context-services test
pnpm --filter=@lib/context-services typecheck
```

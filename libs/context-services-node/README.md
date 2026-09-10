# @lib/context-services-node

Node/Bun live layer for the `OS` service defined in [`@lib/context-services`](../context-services).

Provides `OSLive` — the concrete Effect `Layer` that backs the `OS` service with `node:process`/`node:os`.

## Scripts

```sh
pnpm --filter=@lib/context-services-node test
pnpm --filter=@lib/context-services-node typecheck
```

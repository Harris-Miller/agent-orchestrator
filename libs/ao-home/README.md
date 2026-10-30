# @lib/ao-home

Agent Orchestrator home seam: resolve/ensure `~/.ao` and read/write User settings (`settings.json`).

All filesystem I/O under the Agent Orchestrator home goes through this package. Live `OS` / `Path` / `FileSystem` come from the host (e.g. `@lib/context-services-tauri`).

See [`GLOSSARY.md`](./GLOSSARY.md) for the domain glossary.

## Scripts

```sh
pnpm --filter=@lib/ao-home test
pnpm --filter=@lib/ao-home typecheck
```

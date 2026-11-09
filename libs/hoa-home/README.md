# @lib/hoa-home

HOA home seam: resolve/ensure `~/.hoa` and read/write User settings (`settings.json`).

All filesystem I/O under the HOA home goes through this package. Live `OS` / `Path` / `FileSystem` come from the host (e.g. `@lib/context-services-tauri`).

See [`GLOSSARY.md`](./GLOSSARY.md) for the domain glossary.

## Scripts

```sh
pnpm --filter=@lib/hoa-home test
pnpm --filter=@lib/hoa-home typecheck
```

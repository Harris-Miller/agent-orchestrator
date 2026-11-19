# Per-cwd session index with merge-on-write

Amends [ADR 0016](./0016-cache-harness-history-and-config-option-index.md), which described the application session index as one flat list of rows, whole file rewritten from in-memory state, and reconciled by list scope.

The application index (`session-index.json`, one per launch target) is grouped by cwd (`{ cwds: { <cwd>: rows[] } }`) and capped at the 10 newest rows (`updatedAt`) per cwd **plus** the pinned sessions of that cwd, so startup reads a handful of rows per Project instead of every row ever listed.

- **Merge-on-write.** The host re-reads the file and rewrites only the cwd entries it lists (desktop: its Projects; VS Code: the Workspace cwd). Desktop and VS Code share one file per launch target, so neither discards the other's cwds.
- **Per-cwd reconcile.** A complete `session/list` of a cwd replaces only that cwd's cached rows; a failed list drops nothing; a host that lists no cwd (VS Code with no folder) leaves state untouched. This replaces ADR 0016's unscoped/cwd-scoped/Skip reconcile.
- **Hydration.** Desktop hydrates only the loaded Projects' entries, as unavailable rows until a successful list confirms them. Other cwds stay in the file untouched.
- **Stop tracking** removes that Project's entries.
- **Unchanged from ADR 0016.** Last-write-wins per file with no lock; a corrupt file reads as empty and is overwritten by the next write; IO read failures still prevent the persister from starting.

No migration: consumers delete the old `session-index.json` (#386).

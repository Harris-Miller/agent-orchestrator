# Cache Harness Session History and Config option index

Persist the Harness application session index and Config option index under `~/.hoa/providers/<launchTarget>/`. The application index records the Harness view of sessions. Cached session rows hydrate before Backend Harnesses mount and stay unavailable until a successful `session/list` confirms them.

Session History lists reconcile per cwd. Each complete `session/list` of a cwd replaces only that cwd's cached rows, preserving every other cwd; a failed list drops nothing; a host that lists no cwd (VS Code with no folder) leaves state untouched. A corrupt or undecodable cache file hydrates as empty and is overwritten by the next write; the cache is rebuildable from `session/list`, so it is not worth preserving. IO read failures (not corruption) still prevent a target's Session History persister from starting, since the file may be intact but temporarily unreadable.

Writes use last-write-wins without a filesystem lock. The webview filesystem does not provide `open`, so cross-process lockfiles are unavailable. Each flush reads current in-memory state when it executes, preventing an older queued snapshot from resurrecting a deleted row.

The Config option index cache hydrates before the agent probe and is replaced only after successful probe publication. Removed models reset to provider defaults; removed or invalid option values reset to the option's current default. Active sessions reconcile after successful load/resume; failures are logged and do not fail activation.

Partially supersedes [ADR 0007](./0007-config-option-index-via-config-probe.md), which described the index as ephemeral.

## Amendment (#386): per-cwd index

The application index is grouped by cwd (`{ cwds: { <cwd>: rows[] } }`) and capped at the 10 newest rows (`updatedAt`) per cwd plus the pinned sessions of that cwd, so startup reads a handful of rows per Project instead of every row ever listed. Writes are merge-on-write: the host re-reads the file and rewrites only the cwd entries it lists (desktop: its Projects; VS Code: the Workspace cwd), so desktop and VS Code, which share one file per launch target, never discard each other's cwds. Desktop hydrates only the loaded Projects' entries; other cwds stay in the file untouched. Stop tracking removes that Project's entries. Still last-write-wins per file, and a corrupt file still reads empty.

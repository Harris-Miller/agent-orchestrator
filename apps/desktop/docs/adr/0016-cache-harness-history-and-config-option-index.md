# Cache Harness Session History and Config option index

Persist the Harness application session index and Config option index under `~/.hoa/providers/<launchTarget>/`. The application index records the Harness view of sessions. Cached session rows hydrate before Backend Harnesses mount and stay unavailable until a successful `session/list` confirms them.

Session History refreshes reconcile by scope. Unscoped lists replace the view; cwd-scoped lists replace only rows in that cwd while preserving rows from other workspaces; Skip leaves state untouched. A corrupt or undecodable cache file hydrates as empty and is overwritten by the next write; the cache is rebuildable from `session/list`, so it is not worth preserving. A cwd-scoped host (VS Code) may therefore lose other cwds' cached rows until those cwds are listed again. IO read failures (not corruption) still prevent a target's Session History persister from starting, since the file may be intact but temporarily unreadable.

Writes use last-write-wins without a filesystem lock. The webview filesystem does not provide `open`, so cross-process lockfiles are unavailable. Each flush reads current in-memory state when it executes, preventing an older queued snapshot from resurrecting a deleted row.

The Config option index cache hydrates before the agent probe and is replaced only after successful probe publication. Removed models reset to provider defaults; removed or invalid option values reset to the option's current default. Active sessions reconcile after successful load/resume; failures are logged and do not fail activation.

Partially supersedes [ADR 0007](./0007-config-option-index-via-config-probe.md), which described the index as ephemeral.

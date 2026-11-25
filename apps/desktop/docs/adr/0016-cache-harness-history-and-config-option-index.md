# Cache Harness Session History and Config option index

_The Session History half is superseded by [hoa-home ADR 0008](../../../../libs/hoa-home/docs/adr/0008-tracked-sessions-store-replaces-session-index.md): the index is now the authoritative Tracked sessions store. The Config option index half stands._

Persist the Harness application session index and Config option index under `~/.hoa/providers/<launchTarget>/`. The application index records the Harness view of sessions. Cached session rows hydrate before Backend Harnesses mount and stay unavailable until a successful `session/list` confirms them.

Session History refreshes reconcile by scope. Unscoped lists replace the view; cwd-scoped lists replace only rows in that cwd while preserving rows from other workspaces; Skip leaves state untouched. A corrupt or undecodable cache file hydrates as empty and is overwritten by the next write; the cache is rebuildable from `session/list`, so it is not worth preserving. A cwd-scoped host (VS Code) may therefore lose other cwds' cached rows until those cwds are listed again. IO read failures (not corruption) still prevent a target's Session History persister from starting, since the file may be intact but temporarily unreadable.

Writes use last-write-wins without a filesystem lock. The webview filesystem does not provide `open`, so cross-process lockfiles are unavailable. Each flush reads current in-memory state when it executes, preventing an older queued snapshot from resurrecting a deleted row.

The Config option index cache hydrates before the agent probe and is replaced only after successful probe publication. In Virtual drafts, removed models reset to the provider's starting model; removed or invalid option values reset to the option's recommended (else current) value. A loaded or resumed Session keeps what the agent's load response reported, since the cached index may be stale; only a model the index marks Unavailable is reset (to the default row's current values), and Recommended values (`recommendedValue` in the option's AIR `_meta`) are never applied to it. New Virtual and Handoff Sessions start on them: seeded from the index, then a follow-up pass at Materialize / Handoff sets any unhydrated option the user did not set. Failures are logged and do not fail activation.

Partially supersedes [ADR 0007](./0007-config-option-index-via-config-probe.md), which described the index as ephemeral.

Amended by [ADR 0021](./0021-per-cwd-session-index-merge-on-write.md): the index is per cwd, and reconciliation is per cwd rather than by scope.

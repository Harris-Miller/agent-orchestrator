# Cache Harness roster and Config option index

Persist the Harness application session index and Config option index under `~/.ao/harness/<launchTarget>/`. The application index is distinct from `adapters/<launchTarget>/roster.json`: it records the Harness view of sessions, while the adapter roster is owned by an ACP adapter. Cached session rows hydrate before Backend Harnesses mount and stay unavailable until a successful `session/list` confirms them.

Roster refreshes reconcile by scope. Unscoped lists replace the view; cwd-scoped lists replace only rows in that cwd while preserving rows from other workspaces; Skip leaves state untouched. Read failures prevent a target's roster persister from starting, avoiding accidental loss of unobserved cwd rows.

Writes use last-write-wins without a filesystem lock. The webview filesystem does not provide `open`, so cross-process lockfiles are unavailable. Each flush reads current in-memory state when it executes, preventing an older queued snapshot from resurrecting a deleted row.

The Config option index cache hydrates before the agent probe and is replaced only after successful probe publication. Removed models reset to provider defaults; removed or invalid option values reset to the option's current default. Active sessions reconcile after successful load/resume; failures are logged and do not fail activation.

Partially supersedes [ADR 0007](./0007-config-option-index-via-config-probe.md), which described the index as ephemeral.

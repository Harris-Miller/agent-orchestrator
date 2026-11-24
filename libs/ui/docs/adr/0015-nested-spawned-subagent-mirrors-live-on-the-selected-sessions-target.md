# Nested Spawned subagent mirrors live on the Selected session's launch target

Issue #277 lets a Spawned subagent session start Spawned subagent sessions of its own, up to three levels below the Selected session. [ADR 0011](./0011-spawned-subagents-are-root-sessions-mirrored-into-the-parent.md) mirrored a child into its parent's launch target, which is the Selected session's target only for a direct child. Everything that reads the Subagent tree (`subagentViewAtom`, `selectedSubagentsRecordAtom`, `rootAncestorId`, `hasWorkingSubagent`, `turnActivity`, `notifyAttention`) is per snapshot and already walks `parentSessionId`.

## Decision

- **Where a mirror lives.** A descendant's mirror sits in the `subagents` of the Selected (root-most, non-child) session's launch target, keyed by the child id, with `parentSessionId` the child's direct parent (never reparented). A link records this as `mirrorLaunchTarget` (and `rootSessionId`); `projectOnce`, `settleLink` and dropping a mirror write there, not to `parentLaunchTarget`. For a direct child the two are the same.
- **Where a row lives.** A child's row in its parent's transcript goes into the parent's own root entry (`sessions[parentId]` on the parent's launch target), not into the parent's mirror: the projection overwrites the mirror's transcript from the root entry, and carries the row there. The Subagent view of a child therefore shows its children as rows.
- **Limits.** Depth is the number of links up to the Selected session (`MAX_SPAWN_DEPTH = 3`), a parent keeps at most 8 live children, and a Selected session at most 24 live descendants (live plus reserved slots, checked and reserved in one synchronous step). Reports, `wait_subagent` and `cancel_subagent` address only the direct parent.

## Considered options

- **Mirror in the parent's own launch target:** rejected; when the parent is itself a Spawned subagent that target's snapshot is one the Selected session's Subagent view never reads, so a grandchild would be invisible.
- **A global cross-target tree:** rejected, as in ADR 0011; every per-snapshot reader would be rewritten for one feature.

## Consequences

- Restored subagents stay leaves: a replayed transcript rebuilds only the Subagent results it contains, never grandchildren.
- Nested spawning stays behind Experimental: App Orchestrated Agents, like the Hub client itself.

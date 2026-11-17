# A Spawned subagent session is a root session on its own launch target, mirrored into its parent's Subagent sessions

Issue #358 lets an agent start a child on any launch target through the Hub's `spawn_subagent`. The Subagent model assumed the child lives on the parent's launch target (`subagents` sits on one Backend harness snapshot, populated from the parent's own `subagent_spawned` updates), but a Codex child of a Claude parent talks to the Codex connection. The Prompt turn machinery (`beginPromptTurn`, `sendPromptTurn`, Prompt turn cancel, Config diffs) only works on an entry in that snapshot's `sessions` map, so the child is bound there as a root session on its own launch target (as Bind does: in the map, not a History entry), and a link recorded on the Harness routes its transcript, Pending interactions and Work state into the parent's launch target's `subagents`, which the Subagent view, Work state and Attention events already read. `SubagentSnapshot` gains its own `launchTarget` so cancel, replies and provider badges (#354) address the child's connection, not the parent's.

## Considered options

- **Move `subagents` out of per-launch-target snapshots into one cross-target tree:** rejected; every reader (`subagentViewAtom`, `rootAncestorId`, the event fold) is per snapshot, and `Connection lost` resets state per launch target. A global tree would rewrite all of them for one feature.
- **Drive the child through raw `sendPrompt` and keep it only in the parent's `subagents`:** rejected; it skips the single Prompt turn lifecycle (atomic start, soft cancel, Attention event), so the Harness would maintain two turn implementations.

## Consequences

- The child exists in two places for the link's life: a root entry on its own target (drives the turn, receives its RPC responses) and a mirror in the parent's target. The root entry is the source of truth for the turn; the mirror is a view.
- A link is memory only. After a restart the child is an ordinary session of its own launch target in Session History, attributed to nothing.
- While linked to a live parent the child is hidden from Session History; the hide key is the child's `(launchTarget, sessionId)` in the link registry, not a field on the History row, so the row reverts to normal when the link ends.
- Two connection losses matter: the child's target (fails the child) and the parent's target (cancels and closes the children).
- A Spawned subagent session never targets its parent's own launch target (the root entry and the mirror would collide in one snapshot).

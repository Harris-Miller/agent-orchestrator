# Activate chooses `session/load` or `session/resume` from local transcript state

When the user activates an inactive roster entry, the Harness calls `session/resume` if that `sessionId` already has a session snapshot with non-empty `chatItems`; otherwise it calls `session/load`.

ACP does not tell the Client which RPC to use on re-activation. `session/load` replays history via `session/update` notifications (needed when the Harness has no local transcript). `session/resume` re-attaches without replay (appropriate when the Harness already holds the transcript, e.g. after Deactivate). Using local `chatItems` as the signal avoids replaying a transcript the UI already shows.

## Considered options

- **Always `session/load`:** correct when the Harness has no local state, but replays history the UI already has after Deactivate.
- **Always `session/resume`:** avoids duplicate replay when local state exists, but misses agent-side history when the Harness restarted and the roster was refetched with an empty snapshot.
- **Track prior activation in snapshot metadata:** more explicit than `chatItems.length`, but extra state for the same decision.

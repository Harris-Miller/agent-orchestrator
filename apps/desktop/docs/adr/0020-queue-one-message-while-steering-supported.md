# Queue one message per Session while Steering is offered

Partially supersedes [ADR-0018](0018-steer-in-flight-turn-never-queue.md), which rejected a client-side prompt queue.

While a prompt turn is in flight and Steering is offered (Steering supported, no Pending interaction, draft has content), the user can instead **Queue** the draft. The User setting `midTurnSend` (`steer` default, `queue`) picks what the primary Send button and Enter do; the Send options menu (the chevron next to Send) offers the opposite for that one message. Queue never applies to Agents without Steering supported: their draft stays unsent, as before.

## Decisions

- **One slot, not a list.** Each Session holds one Queued message. Queuing again merges into it (text newline-joined, attachments concatenated), so there is no ordering to get wrong and no chip list to maintain. The Composer shows it as a single row above the editor with an Edit button that moves it back into the draft.
- **Sent through `sendPromptTurn`.** When the in-flight turn is over (the Session is gone, not active, or has no Pending client request) the queued message is taken and sent as a normal new Prompt turn, so Pending client request accounting and Attention events are unchanged. A refusal puts the message back into the draft, ahead of anything typed since. The wait is shared with the Steering fallback, which now also stops waiting when the Session is no longer active (a refusal instead of the 5 second timeout).
- **Prompt turn cancel un-queues.** `cancelPromptAtomFn` moves the Queued message back into the draft before sending the cancel, for every caller (the Composer's cancel button and Deactivate alike), so nothing auto-sends once the turn was cancelled. The Harness itself does not know about the slot; the Composer owns it.
- **In memory only.** The slot is not persisted. Reloading the app drops it, same as an unsent draft.
- **Steering and the Harness rule unchanged.** `turnAction` still returns `Steer` for "a mid-turn message is allowed"; Steer vs Queue is purely a Composer choice, read together with the Composer action when submitting.

## Considered options

- **Ordered queue with per-message chips and removal:** more state (ordering, clearing on error and deactivate) than one slot needs.
- **Queue for Agents without Steering supported:** deferred; the issue scopes this to Providers that advertise Steering.
- **Send queued messages after Prompt turn cancel:** surprising; a cancelled turn should leave the agent idle.

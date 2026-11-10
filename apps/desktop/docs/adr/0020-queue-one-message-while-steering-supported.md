# Queue one message per Session while a Steering is offered

Partially supersedes [ADR-0018](0018-steer-in-flight-turn-never-queue.md), which rejected a client-side prompt queue.

While a prompt turn is in flight and Steering is offered (Steering supported, no Pending interaction, draft has content), the user can instead **Queue** the draft. The User setting `midTurnSend` (`steer` default, `queue`) picks what the primary Send button and Enter do; right-clicking the Send button offers the opposite for that one message. Queue never applies to Agents without Steering supported: their draft stays unsent, as before.

## Decisions

- **One slot, not a list.** Each Session holds one Queued message. Queuing again merges into it (text newline-joined, attachments concatenated), so there is no ordering to get wrong and no chip list to maintain. The Composer shows it as a single row above the editor with an Edit button that moves it back into the draft.
- **Sent through `sendPromptTurn`.** When the in-flight turn is over (the Session is gone, not active, or has no Pending client request) the queued message is taken and sent as a normal new Prompt turn, so Pending client request accounting and Attention events are unchanged. A refusal puts the message back into the draft, ahead of anything typed since.
- **Prompt turn cancel un-queues.** Stop moves the Queued message back into the draft first, so nothing auto-sends after the user stopped the agent. The Harness does not know about the slot; the Composer owns it.
- **In memory only.** The slot is not persisted. Reloading the app drops it, same as an unsent draft.
- **Steering and the Harness rule unchanged.** `turnAction` still returns `Steer` for "a mid-turn message is allowed"; Steer vs Queue is purely a Composer choice, read together with the Composer action when submitting.

## Considered options

- **Ordered queue with per-message chips and removal:** more state (ordering, clearing on error and deactivate) than one slot needs.
- **Queue for Agents without Steering supported:** deferred; the issue scopes this to Providers that advertise Steering.
- **Send queued messages after Stop:** surprising; Stop should leave the agent idle.

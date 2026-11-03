# Steer the in-flight turn via `_session/steering`; never queue prompts

While a prompt turn is in flight the Composer stays editable (text and attachments), but sending is gated. When the Agent advertises `_meta.steering.supported`, the primary button becomes a Send ("Steer") button whenever the draft has content and the Harness calls `_session/steering` (Claude and Codex adapters) with `idleBehavior: "promptRequired"`; the steered message joins the same turn. If the Agent answers `promptRequired` (turn already ended) the Harness falls back to a normal `session/prompt`. Without Steering supported, the draft is kept but cannot be sent and Prompt turn cancel stays primary. Esc (when no typeahead menu consumes it) only cancels a Pending elicitation; it never cancels the prompt turn. Enter steers or does nothing, it never cancels.

`_session/steering` is a hand-written RPC kept off the stable `AgentRpcs` allowlist, like `_session/archive`. `startedNewTurn` (the legacy default when `idleBehavior` is omitted) is decoded but never requested: it starts a detached turn with no `session/prompt` response, which would break Pending client request accounting. Steering does not set Pending client request, so several steers per turn are allowed; it is blocked while a Pending interaction is open.

## Considered options

- **Client-side prompt queue when steering is unsupported:** descoped — extra state (ordering, pause on cancel, clear on error/deactivate, chips UI) for a fallback no current Agent needs.
- **Rely on Claude `agentCapabilities._meta.claudeCode.promptQueueing`:** a second `session/prompt` queues as its own turn; different semantics, Claude-only, and Claude supports steering anyway.
- **Enter cancels the turn (previous form-submit behaviour) while steering:** one key meaning stop in one state and send in another is a misfire risk.

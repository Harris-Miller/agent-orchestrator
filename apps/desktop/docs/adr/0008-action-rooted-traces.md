# Action-rooted traces; turn combines Agent→Client work

Harness traces are rooted at **action roots** (user or system), not at a long-lived connect/spawn span. Lifetime connection setup is a short **connection setup** action of its own. While an ACP **Turn** is in flight for a session, Agent→Client traffic (session updates, elicitation, permission) and the user’s respond to those **combine** into that turn’s trace; when no turn is open, the same traffic is a short root — never parented under bootstrap or connect.

Client inbound RpcServer auto-spans are off on the harness path; only the three turn-correlated methods are manually traced (stubs stay silent).

## Considered options

- **Parent everything under `connectAcpAgent` (scoped ParentSpan):** keeps demux callbacks correlated, but produces mega-traces of lifetime `session/update` under setup and hides action roots.
- **Detach ParentSpan only, leave auto RpcServer orphans:** stops mega-traces but still floods Tempo with unparented updates and never links elicitation/respond to the prompt.
- **Disable Client inbound auto-RPC spans + manual turn parenting (chosen):** segregates setup from turns; combines turn-correlated work under the in-flight prompt.

## Consequences

- Ending a setup span (or omitting ParentSpan from forks) is required — Effect will still parent under an **ended** ParentSpan if it remains in fiber context.
- Respond-while-turn-open shares the prompt trace; orphan respond is a short root, not a new standing “user action” glossary term.

## Addendum: subagent sessions

Turn-correlated work attributed to a **subagent session** (child updates, permission/elicitation, cancel) parents under the **root ancestor's** in-flight prompt span, found through the child→parent map held with the live ACP Connection (`sessionRpc`). If the root turn is closed, the work is a short root, as for any orphan traffic. A child never owns a prompt span.

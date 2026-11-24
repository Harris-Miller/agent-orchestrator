# Analytics events are a separate pipeline from OTLP, with a closed allowlisted catalog

Product **Analytics events** (what users do: a session archived, a prompt sent) go to a product analytics vendor (PostHog) through the portable `Analytics` Host service (#451). Observability (traces, logs, metrics) keeps going to OTLP. They are two pipelines with different audiences and different rules.

**The catalog is closed.** Events exist only as builders in `libs/ui/src/analytics/catalog.ts`; each fixes its own name (snake_case, `object_action`, past tense) and allowlisted primitive properties (`boolean | number | string`). `Analytics.capture` accepts only the branded `AnalyticsEvent` those builders make, so a call site cannot invent an event or attach a free-form property. Builders take narrow inputs (a launch target, a count, a closed union), never a string the user or an agent wrote. This extends root ADR 0002: no prompt text, titles, paths, URLs, ids, option names or agent text ever reaches an event. As in ADR 0002, the brand marks output but cannot stop a deliberate bypass, so review is the final guard; a canary test plants a marker in the free-text fields the triggers can see and asserts it reaches no event.

**Triggers are user-action boundaries, success only.** `trackEvent(event)` is one extra `pipe` stage next to an action's root span and captures once the action succeeded; failures stay in logs and spans (no failure events). Capture is fire-and-forget: forked, bounded to one 5 second attempt, no retry, and a failure is a debug log, so analytics can never fail or block a user action. Exception: where the event needs data computed inside the action (permission / elicitation responded, `prompt_sent`, `session_created`), the action calls `captureEvent` mid-generator instead of the `trackEvent` stage; it is still success-only (called after the last failure point) and the event is still built from the catalog.

**Dev builds only for now, off by default.** Like OTLP, `POSTHOG_HOST` is read only in dev builds, `POSTHOG_PROJECT_TOKEN` is fixed at bundle time from the app's gitignored `.env`, only a dev build uses it, and an empty token is a silent no-op. The app-session id (#454) is the `distinct_id` until #193 adds a persisted anonymous user id behind the same service. The Hub emits no analytics events (agent tool calls are not user actions). Production export and consent are #453 and #193.

## Considered options

- **Free-form events (`capture("name", { ... })`):** simplest, but any call site can put free text or private data in a property, and the event vocabulary drifts. Rejected.
- **Dual-export OTLP to PostHog (spans/logs as events):** no new service, but OTLP carries span names and attributes shaped for debugging, not a reviewed product vocabulary, and PostHog's OTLP ingestion is not an event pipeline. It would also tie product analytics to the observability allowlist. Rejected.
- **A separate closed-catalog `Analytics` service (chosen):** the vendor is one Live (`@lib/analytics-posthog`), so swapping vendors replaces one package.

## Consequences

- A new user-facing action gets an event from the catalog via `trackEvent` (see `AGENTS.md`, Telemetry).
- Unit tests never provide a real analytics Live; they use an in-memory recording `Analytics` layer.
- Running a local PostHog to see events is documented in `docs/local-posthog.md`.

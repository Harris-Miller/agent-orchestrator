# Provider config catalog and Harness config defaults persist per agent launch target

Session configuration is session-scoped and ephemeral across app restarts. Create and handoff flows need the agent's selectable options (and the user's preferred values) before a target session exists. The Harness therefore stores a **Provider config catalog** under `harness/<launchTarget>/provider-config-catalog.json` via `@lib/ao-home`, and **Harness config defaults** in User settings (`harnessConfigDefaults`), keyed by agent launch target.

The catalog is overwritten whenever a session activation or config update returns selectable `configOptions`. Defaults are seeded once from agent `currentValue` on first catalog write, then changed only via live edits on the Settings Harness defaults pane — not by mid-session `set_config_option`, create pickers, or handoff overrides. If a stored default disappears from the refreshed choice list, it falls back to the agent's new `currentValue`.

On **Create new session**, after `session/new` the Harness applies harness defaults that differ from the agent-returned values via `session/set_config_option` (ACP has no config fields on `session/new`). That apply does not rewrite stored defaults.

## Considered options

- **Session-only configuration (previous):** accurate while a session is active, but cannot drive create/handoff pickers or survive restart without re-opening a session.
- **Overwrite defaults on every config change:** simpler last-used behavior, but fights LLM prompt-cache stability and would treat ephemeral handoff overrides as global preferences.
- **Persist only after explicit Save (+ first seed):** keeps user intent separate from transient session edits; catalog still stays fresh for pickers. Replaced chat “Save as defaults” with Settings live-write editors; first seed on catalog refresh remains automatic.
- **localStorage blob (previous):** both catalog and defaults in `acp-provider-config:*`. Abandoned for Agent Orchestrator home + User settings so prefs survive across hosts and match other durable state.

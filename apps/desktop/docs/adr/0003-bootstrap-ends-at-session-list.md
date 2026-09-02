# Bootstrap ends at `session/list`, not `session/new`

When a backend harness comes online it runs `initialize` then `session/list` and reaches the `ready` bootstrap phase. It does **not** auto-create a session via `session/new`. The user creates a new session or activates an existing roster entry explicitly.

This separates agent connectivity (bootstrap) from session lifecycle (user-driven). Bootstrap no longer implies a single implicit session, so multi-session management — roster, selection, activation — has a clean boundary. An empty roster after `ready` is valid.

## Considered options

- **Auto-`session/new` on bootstrap (previous behavior):** simpler first-run UX, but conflates "agent is online" with "there is exactly one session," and fights multi-session roster/selection.
- **Auto-activate the most recent roster entry:** still hides session choice and assumes one session should always be hot.

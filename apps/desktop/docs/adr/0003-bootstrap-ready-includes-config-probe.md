# Bootstrap Ready includes Config probe; no user-visible auto session

When a backend harness comes online it runs `initialize`, then enters **`probing`**: buffers `session/list`, runs a disposable-cwd **Config probe** (`session/new` → per-model `set_config_option` → publish Config option index → best-effort `session/close`), applies the buffered roster, and reaches **`ready`**.

Ready means Config probe completed (and buffered list applied), including probes that soft-failed some model switches as Unavailable models. The probe session is **not** an Active session, never Materialized, and never a Roster entry. The user still creates a new session or activates an existing roster entry explicitly.

This keeps agent connectivity (bootstrap + probe) separate from user-driven session lifecycle. An empty roster after `ready` remains valid.

## Considered options

- **Auto-`session/new` on bootstrap as the user session (previous behavior):** simpler first-run UX, but conflates "agent is online" with "there is exactly one session," and fights multi-session roster/selection.
- **Auto-activate the most recent roster entry:** still hides session choice and assumes one session should always be hot.
- **Ready at `session/list` only (superseded):** left create/handoff without per-model selectable options until a live session existed.

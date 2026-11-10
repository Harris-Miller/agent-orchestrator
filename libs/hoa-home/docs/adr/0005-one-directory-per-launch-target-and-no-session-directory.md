# One directory per launch target; no per-session directory

Harness-owned files (`session-index.json`, `pinned-sessions.json`, `config-option-index.json`) live in `~/.hoa/providers/<launchTarget>/` beside `runtime/` and `current.json`, replacing the separate `~/.hoa/harness/<launchTarget>/`. `providers/` won over `harness/` because the Rust path checks, the Tauri shell-scope validator, and the VS Code path guard already key on it. The `harnessDirPath` helper is gone; callers use `providerDir`.

`~/.hoa/sessions/<id>/usage.json` is removed along with `readSessionUsage` / `writeSessionUsage` / `deleteSessionDir`. Usage stays in memory and is shown only when the agent reports it; providers that do not replay it on `session/load` show none until the next prompt. This trades a stale readout for less code and disk, and supersedes ADR 0003.

No migration, per root ADR 0001: stale `~/.hoa/harness/` and `~/.hoa/sessions/` are ignored and the session index, pins, and config option index start fresh. Pins in the old `harness/` file are lost.

# Virtual session eager Bind

ADR 0011 deferred `session/new` until first Send. That left Composer Triggers (`/` commands, `@` FS) dark until Materialize. We now **Bind** eagerly: once Virtual has absolute Session cwd + launch target and that backend is Bootstrap `ready`, call `session/new`, upsert the session snapshot into the harness sessions map (no Roster), and store the Bound `sessionId` on the Virtual blob. Selected stays Virtual. **Materialize** remains first-Send promote (leftover Config diffs, roster upsert, Select Session, clear Virtual, prompt) — not a second `session/new` when already Bound. Roster publish drops the Bound id until promote. Supersedes ADR 0011’s defer-`session/new` timing only; Virtual draft ownership and non-persistence stay.

## Considered options

- **Keep defer-until-Send (ADR 0011):** simplest lifecycle, but Bound Active sessionId unavailable for Triggers/Config live apply.
- **Widen `selectedSessionIdAtom` to Virtual Bound:** couples Session-arm selectors to draft; rejected — derived Bound helpers instead.
- **Roster entry at Bind:** History would show unfinished drafts; filter-at-publish + Materialize roster upsert is thinner.
- **Post-create cwd mutator / vendor `_meta`:** ACP v1 has no cwd update; cwd change always teardown + Bind.

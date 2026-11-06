# Virtual session eager Bind

ADR 0011 deferred `session/new` until first Send. That left Composer Triggers (`/` commands, `@` FS) dark until Materialize. We now **Bind** eagerly: once Virtual has absolute Session cwd + launch target and that backend is Bootstrap `ready`, call `session/new`, upsert the session snapshot into the harness sessions map (no Session History, no Config apply), and store the Bound `sessionId` on the Virtual blob. Selected stays Virtual. **Materialize** remains first-Send promote (apply Virtual `configValues`, Session History upsert, Select Session, clear Virtual, prompt) — not a second `session/new`. Session History publish drops the Bound id until promote. Bind triggers (see `libs/ui` glossary **Bind**): creating or re-selecting the Virtual session, a launch target or cwd change, the provider becoming `usable`, and Send when no Bind is in flight. Supersedes ADR 0011’s defer-`session/new` timing only; Virtual draft ownership and non-persistence stay. While Selected is Virtual, Config changes write only the Virtual blob; the Bound session's live Config may differ until Materialize applies diffs.

**Leaving Virtual** (Select a Session, clear Selected) is navigation and never waits on the Bind / Materialize lifecycle lock. Composer content (non-blank draft or attachments) keeps the Virtual blob and its Bound session, so in-flight Bind or Materialize finishes in the background; Materialize only Selects the promoted Session if Selected is still Virtual. An empty Composer discards the blob with best-effort Bound teardown (an in-flight Bind tears down its orphan once `session/new` returns).

## Considered options

- **Keep defer-until-Send (ADR 0011):** simplest lifecycle, but Bound Active sessionId unavailable for Triggers/Config live apply.
- **Widen `selectedSessionIdAtom` to Virtual Bound:** couples Session-arm selectors to draft; rejected — `selectedActiveSessionAtom` / Bound helpers instead.
- **History entry at Bind:** History would show unfinished drafts; filter-at-publish + Materialize Session History upsert is thinner.
- **Post-create cwd mutator / vendor `_meta`:** ACP v1 has no cwd update; cwd change always teardown + Bind.
- **Apply Config at Bind:** duplicates Materialize's config apply; Bind stays create+upsert only.
- **Bind from Materialize as fallback:** second create path; rejected — Send no-ops until Bound.

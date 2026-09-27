# Config option index via Config probe (supersedes provider catalog + harness defaults)

Selectable config options for create/handoff are no longer persisted to disk. During Bootstrap **`probing`**, a disposable-cwd **Config probe** builds an ephemeral **Config option index** (State Atom per agent launch target: `defaultModelId` + `byModel` selectable rows with probe `currentValue`s). Handoff reads that index; Create uses `session/new` `currentValue`s only.

Each model’s `set_config_option` response is stored **as-is** under that model id (authoritative full option-id set for that model — no probe-local merge across models). Chat live Session configuration still merges `options` fill-in for present ids but **drops** ids absent from the response (#53 absorbed).

Probe failure (no `model`, mid-loop RPC fail) → Bootstrap `error`; index cleared at `probing` start and on restart; no partial publish. `session/close` failure is **not** probe failure — warn and still Ready with published index. Roster `session/list` is buffered during probing and published only after index publish, immediately before `ready`; the roster callback never sets phase.

Deleted: Provider config catalog document, Harness config defaults (`harnessConfigDefaults`), Settings defaults pane, `sessionStorage` catalog.

## Considered options

- **Provider config catalog + Harness config defaults on disk (previous ADR):** survived restart for pickers, but duplicated Session configuration, fought “agent is source of truth,” and required Settings sync paths.
- **Session-only configuration:** accurate while a session is active, but cannot drive handoff pickers before a target session exists.
- **Overwrite durable defaults on every config change:** simpler last-used behavior, but fights LLM prompt-cache stability and treats ephemeral handoff overrides as global preferences.

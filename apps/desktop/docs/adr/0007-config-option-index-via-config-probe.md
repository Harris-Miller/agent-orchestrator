# Config option index via Config probe (supersedes provider catalog + harness defaults)

Selectable config options for create/handoff are no longer persisted to disk. During Bootstrap **`probing`**, a disposable-cwd **Config probe** builds an ephemeral **Config option index** (State Atom per agent launch target: `defaultModelId` + `byModel` selectable rows with probe `currentValue`s + `unavailableModelIds`). Handoff and Virtual-session chat read that index for pickers; Materialize-on-first-send still applies Config diffs after `session/new` (same as Handoff).

Each model’s successful `set_config_option` response is stored **as-is** under that model id (authoritative full option-id set for that model — no probe-local merge across models). Chat live Session configuration still merges `options` fill-in for present ids but **drops** ids absent from the response (#53 absorbed).

Each non-default model switch is soft-failed independently: mid-loop `session/set_config_option` failure omits that model from `byModel`, lists it in `unavailableModelIds` (Unavailable model — disabled `(unavailable)` in model selects), and the probe continues. Hard probe failure (no `model` on `session/new`) → Bootstrap `error`. Soft-failed models still allow partial publish and Ready. `session/close` failure is **not** probe failure — warn and still Ready with published index. Roster `session/list` is buffered during probing and published only after index publish, immediately before `ready`; the roster callback never sets phase. ADR 0016 supersedes the ephemeral-only storage decision: the index is now cached per launch target and retained while probing.

Deleted: Provider config catalog document, Harness config defaults (`harnessConfigDefaults`), Settings defaults pane, `sessionStorage` catalog.

## Considered options

- **Provider config catalog + Harness config defaults on disk (previous ADR):** survived restart for pickers, but duplicated Session configuration, fought “agent is source of truth,” and required Settings sync paths.
- **Session-only configuration:** accurate while a session is active, but cannot drive handoff pickers before a target session exists.
- **Overwrite durable defaults on every config change:** simpler last-used behavior, but fights LLM prompt-cache stability and treats ephemeral handoff overrides as global preferences.

# Virtual Bind is optimistic; the lifecycle lock covers Materialize only

Bind (`session/new` for the Virtual draft) used to share one lifecycle lock with Materialize, so every provider switch locked the composer and Config controls for the whole `session/new` (~0.8s Claude, ~1.74s Codex). Bind is now optimistic and latest-wins: Virtual mutators edit the blob synchronously and request a rebind, a newer `{launch target, cwd, Additional directories}` (the directories compared as a set: order ignored, empty equals absent, so a changed set tears down and re-Binds) supersedes an in-flight Bind (a monotonic generation; the stale session is torn down when it lands), and teardown of the old Bound session runs detached in the background. Only Materialize (Config diffs + history upsert, short) keeps a lock. Send no longer requires a Bound session: it awaits the provider becoming `usable` (an `error` phase fails it), then the current Bind, re-awaiting if the blob churns, then takes the Materialize lock; the draft stays until Materialize succeeds and the composer text freezes while Send is pending.

## Considered options

- **Keep the single lock, shorten Bind:** Bind is an ACP round trip we cannot shorten; the lock is the cost.
- **Serialize Binds (queue instead of supersede):** simpler bookkeeping, but rapid A-B-A switching would wait out every stale `session/new` before the wanted one starts. `session/new` cannot be cancelled, so superseded Binds run to completion and are torn down instead.
- **Interrupt the in-flight Bind fiber:** drops the result and leaks the session the agent already created; Binds run detached so a re-invoked AtomFn cannot interrupt them.

## Consequences

- A `session/new` per superseded switch may be created and deleted; teardown failures are logged and never block the replacement Bind or Send.
- Send can sit pending indefinitely while a provider is stuck before `usable` (no timeout, no cancel); switching provider re-awaits.

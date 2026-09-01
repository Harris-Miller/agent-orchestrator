# AGENTS.md

## Top Level Instructions

* `pnpm run local-ci` should pass before work is considered done
* Lint every changed file with ESLint `--fix` before work is considered done. Package `lint` scripts are `eslint . …`, so extra args after `pnpm run lint --` do not replace `.` — call ESLint per owning package instead, e.g. `pnpm --filter=@libs/effect-acp exec eslint --max-warnings 0 --fix path/rel/to/file.ts` (paths relative to that package; repeat per package when changes span packages)
* NEVER manually update `pnpm-lock.yaml`. If you do update `package.json` `"dependencies"` or `"devDependencies"`, run `pnpm i` after
* NEVER manually update anything under `.agents/` — it is an immutable dependency folder (skills/guides are read-only reference; do not edit, patch, or “improve” files there)

## Agent skills

### Issue tracker

Issues live in GitHub (`Harris-Miller/agent-orchestrator`). See `docs/agents/issue-tracker.md`.

### Domain docs

Multi-context: root `CONTEXT-MAP.md` points to per-package `CONTEXT.md` files; system-wide ADRs in `docs/adr/`, context-scoped ADRs under each package. See `docs/agents/domain.md`.

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

### Effect tests (`@effect/vitest`)

Hard rule (do not soft-prefer this — agents routinely regress here):

* **NEVER** write `it('…', async () => { … await Effect.runPromise(…) })` (or plain Vitest `it` + `Effect.runPromise` / `Effect.runSync`) to exercise Effect code under test.
* **ALWAYS** use `it.effect` when the test runs an Effect. Import `assert` / `describe` / `it` / `layer` from `@effect/vitest`. The callback **returns** an Effect (prefer `Effect.gen`); yield Effects — do not `await Effect.runPromise`.
* Plain `it` is **only** for pure/sync non-Effect helpers (string formatters, sync `assert.throws`, etc.).
* If production code returns a `Promise` at a boundary (for example TanStack `runSharedFeEffect`), still use `it.effect` and bridge with `yield* Effect.promise(() => …)` — that is **not** an excuse for async `it` + `Effect.runPromise`.
* Prefer `layer(...)` / `it.layer(...)` when a group of tests shares the same Layer setup; avoid repeating `Effect.provide(...)` in every test body unless the provision is truly one-off.
* Do **not** assert on `Effect.logInfo` / `Effect.logDebug` / `Effect.logWarning` / `Effect.logError` (or any other logging). Logs are debugging side effects — they should print to the console during test runs, and must **not** be sent to OTEL or any other sink in tests. Never provide `TelemetryLayer` (or other OTEL layers) in unit tests.

```ts
// ❌ banned
it('loads', async () => {
  const value = await Effect.runPromise(loadThing())
  assert.strictEqual(value, 1)
})

// ✅ required
it.effect('loads', () =>
  Effect.gen(function* () {
    const value = yield* loadThing()
    assert.strictEqual(value, 1)
  }),
)
```

Read `node_modules/effect/AGENTS.md` for more details

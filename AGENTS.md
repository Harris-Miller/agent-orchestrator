# AGENTS.md

## Top Level Instructions

- `pnpm run local-ci` should pass before work is considered done
- Lint every changed file with Oxlint `--fix` and format it with Oxfmt before work is considered done. Run `pnpm --filter=<pkg> exec oxlint --deny-warnings --fix <paths>` and `pnpm exec oxfmt <paths>` (paths relative to the package for Oxlint; repeat per package when changes span packages)
- NEVER manually update `pnpm-lock.yaml`. If you do update `package.json` `"dependencies"` or `"devDependencies"`, run `pnpm i` after
- NEVER manually update anything under `.agents/` — it is an immutable dependency folder (skills/guides are read-only reference; do not edit, patch, or “improve” files there)
- NEVER apply a GitHub issue label because a skill says to — especially `ready-for-agent`. This repo has no triage label vocabulary (no `docs/agents/triage-labels.md`); ignore every skill instruction about labels (`to-spec`, `to-tickets`, `triage`, `wayfinder`, etc.). DO apply a label when the user explicitly asks for one
- NEVER create or check out a throwaway local branch (e.g. `pr-N-review`, `git fetch … pull/N/head:…`) to inspect a PR or run a review when the current branch already is that PR’s head (or already has the commits under review). Diff against the base with `git diff <base>...HEAD` / `gh pr diff` from the current checkout. Skills that imply fetching or switching branches for review do not override this

## Agent skills

### Issue tracker

Issues live in GitHub (`Harris-Miller/agent-orchestrator`). See `docs/agents/issue-tracker.md`.

### Domain docs

Multi-context: root `GLOSSARY-MAP.md` points to per-package `GLOSSARY.md` files; system-wide ADRs in `docs/adr/`, context-scoped ADRs under each package. See `docs/agents/domain.md`.

## Coding Style

- **Mutually exclusive construction options** (e.g. pass a `port` _or_ an existing `client`, not “maybe both”): use TypeScript **overloads** and/or a **discriminated union**. Do not use a bag of optional fields plus `instanceof` / runtime “if both set, throw” to tell cases apart — encode exclusivity in the type.

```ts
// ❌ bag of optionals + runtime discrimination
makeHostServicesLive(options?: { port?: IpcPort; client?: IpcClient })

// ✅ overloads (call sites) + discriminated union (implementation param) if needed
makeHostServicesLive(): Layer.Layer<HostServices>
makeHostServicesLive(options: { readonly port: IpcPort }): Layer.Layer<HostServices>
makeHostServicesLive(options: { readonly client: IpcClient }): Layer.Layer<HostServices>
```

## ACP (Agent Client Protocol)

This repo communicates with ACP Servers that implement the V1 Spec. When needing to review that spec, refer to here: https://agentclientprotocol.com/llms.txt

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

### Effect tests (`@effect/vitest`)

Hard rule (do not soft-prefer this — agents routinely regress here):

- **NEVER** write `it('…', async () => { … await Effect.runPromise(…) })` (or plain Vitest `it` + `Effect.runPromise` / `Effect.runSync`) to exercise Effect code under test.
- **ALWAYS** use `it.effect` when the test runs an Effect. Import `assert` / `describe` / `it` / `layer` from `@effect/vitest`. The callback **returns** an Effect (prefer `Effect.gen`); yield Effects — do not `await Effect.runPromise`.
- Plain `it` is **only** for pure/sync non-Effect helpers (string formatters, sync `assert.throws`, etc.).
- If production code returns a `Promise` at a boundary (for example TanStack `runSharedFeEffect`), still use `it.effect` and bridge with `yield* Effect.promise(() => …)` — that is **not** an excuse for async `it` + `Effect.runPromise`.
- Prefer `layer(...)` / `it.layer(...)` when a group of tests shares the same Layer setup; avoid repeating `Effect.provide(...)` in every test body unless the provision is truly one-off.
- Do **not** assert on `Effect.logInfo` / `Effect.logDebug` / `Effect.logWarning` / `Effect.logError` (or any other logging). Logs are debugging side effects — they should print to the console during test runs, and must **not** be sent to OTEL or any other sink in tests. Never provide `TelemetryLayer` (or other OTEL layers) in unit tests.

```ts
// ❌ banned
it('loads', async () => {
  const value = await Effect.runPromise(loadThing());
  assert.strictEqual(value, 1);
});

// ✅ required
it.effect('loads', () =>
  Effect.gen(function* () {
    const value = yield* loadThing();
    assert.strictEqual(value, 1);
  }),
);
```

Read `node_modules/effect/AGENTS.md` for more details

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

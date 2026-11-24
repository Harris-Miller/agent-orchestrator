# AGENTS.md

Repo rules for coding agents. Human contributors follow the same rules; [`CONTRIBUTING.md`](./CONTRIBUTING.md) covers setup, running the apps, branches and PR titles. Read it before your first change.

## Top Level Instructions

- Gitflow: branch from `develop` and open PRs into `develop`; `main` is the release branch (only release PRs from `develop` merge into it). PR titles must be `<Tag>: <Short description>` with a tag from `docs/gitflow.md`; the title is the squash commit and decides the release. See `docs/gitflow.md`.
- NEVER set or bump a version by hand. Versions come from `v*` git tags (semantic-release in release CI); `apps/desktop` and `apps/vscode` stay at `0.0.0` in git, and the root, `libs/` and `tooling/` have no version. See `apps/desktop/docs/alpha-release.md`.
- Lint every changed file with Oxlint `--fix` and format it with Oxfmt before work is considered done. Run `pnpm --filter=<pkg> run lint <paths>` (paths relative to the package for Oxlint; repeat per package when changes span packages). Then `pnpm run fmt` to format all files (this should never be per file, it will always apply format fixes to all, which is desired).
- `pnpm run local-ci` should pass before your current task is considered done.
- NEVER manually update `pnpm-lock.yaml`. If you do update `package.json` `"dependencies"` or `"devDependencies"`, run `pnpm i` after
- NEVER manually update anything under `.agents/` — it is an immutable dependency folder (skills/guides are read-only reference; do not edit, patch, or “improve” files there). Skills there are installed from upstream sources pinned in `skills-lock.json`, and `.claude/skills/*` are symlinks into `.agents/skills/`. A skill changes only by updating its upstream source and re-installing
- NEVER point a `pnpm run tauri:dev` HOA at the checkout it runs from. Every frontend edit reloads the app and every `src-tauri` edit rebuilds and restarts it, killing the agent sessions mid-turn (possibly your own). To run HOA against this repo, use a separate clone or git worktree, or a built app (`pnpm run tauri:build`)
- NEVER apply a GitHub issue label because a skill says to — especially `ready-for-agent`. This repo has no triage label vocabulary (no `docs/agents/triage-labels.md`); ignore every skill instruction about labels (`to-spec`, `to-tickets`, `triage`, `wayfinder`, etc.). DO apply a label when the user explicitly asks for one
- NEVER create or check out a throwaway local branch (e.g. `pr-N-review`, `git fetch … pull/N/head:…`) to inspect a PR or run a review when the current branch already is that PR’s head (or already has the commits under review). Diff against the base with `git diff <base>...HEAD` / `gh pr diff` from the current checkout. Skills that imply fetching or switching branches for review do not override this

## Agent skills

### Issue tracker

Issues live in GitHub (`Harris-Miller/hoa`). See `docs/agents/issue-tracker.md`. In a fork, `gh` may default to either the fork or upstream: check the target with `gh repo view --json nameWithOwner` before filing an issue or opening a PR, and open PRs against upstream's `develop`.

### Domain docs

Multi-context: root `GLOSSARY-MAP.md` points to per-package `GLOSSARY.md` files; system-wide ADRs in `docs/adr/`, context-scoped ADRs under each package. See `docs/agents/domain.md`.

## Coding Style

- **Cross-platform paths in unit tests**: Build file paths and expected paths with platform-aware helpers such as `join()` and `resolve()` so tests pass on Windows and macOS. Preserve raw path segments when testing traversal or other intentionally malformed paths.

- **Mutually exclusive construction options** (e.g. pass a `port` _or_ an existing `client`, not “maybe both”): use TypeScript **overloads** and/or a **discriminated union**. Do not use a bag of optional fields plus `instanceof` / runtime “if both set, throw” to tell cases apart — encode exclusivity in the type.

```ts
// ❌ bag of optionals + runtime discrimination
makeHostServicesLive(options?: { port?: IpcPort; client?: IpcClient })

// ✅ overloads (call sites) + discriminated union (implementation param) if needed
makeHostServicesLive(): Layer.Layer<HostServices>
makeHostServicesLive(options: { readonly port: IpcPort }): Layer.Layer<HostServices>
makeHostServicesLive(options: { readonly client: IpcClient }): Layer.Layer<HostServices>
```

- **Theme colors have a single source of truth** (`libs/ui/src/theme/themes.ts`). Every color token (`ThemeColors`, `Palette`) is **required**, and each theme (`ORIGINAL_COLORS`, `fromCatppuccin`, `vscodeTheme`) sets it explicitly. Components read `theme.palette.*` directly. Do **not** make a palette token optional, derive a default inside `createAppTheme`, or write `theme.palette.x ?? fallback` / ternaries in components — a fallback hides a missing token and lets new call sites diverge from the theme. New themed color → add the required field to `ThemeColors` and `Palette`, set it in every theme. Tests that render themed components wrap them in `<ThemeProvider theme={theme}>`; do not code around a plain MUI theme.

- **Never use `<TextField>`'s `label` prop.** The theme compacts inputs (fixed heights, no notched outline) but not MUI's floating `InputLabel`, so the label renders misaligned. Always wrap the field in the app's `<FieldLabel>` (`@lib/ui`, `htmlFor` + matching `id`), or use `placeholder` + `aria-label` for search/filter inputs.

## Telemetry

- **New user-facing actions get an Analytics event** from the closed catalog in `libs/ui/src/analytics/catalog.ts`, via `trackEvent` as one extra `pipe` stage next to the action's root span (captures on success only). Add a builder to the catalog; never call `makeAnalyticsEvent` elsewhere or add a free-form event. See `docs/adr/0004-analytics-events-separate-from-otlp.md`.
  - **Exception**: when the event needs data computed inside the action (permission / elicitation responded in `chat.atoms.ts`, `prompt_sent` in `promptTurn.ts`, `session_created` at the end of `materialize` in `virtualSession.atoms.ts`), call `captureEvent` mid-generator instead. Success-only capture still applies (call it only after the action's last failure point) and the event is still built from the catalog.
- **Event properties are allowlisted only** (root ADR 0002): launch target, counts, closed unions. Never prompt text, titles, paths, URLs, ids, option names or agent text.
- **New Effects follow the existing span and log conventions**: user action roots get a root span, private data in logs is wrapped in `Redacted`.
- **Unit tests never provide a real analytics or OTLP layer.** Use a recording `Analytics` layer (`libs/ui/src/analytics/recordingAnalytics.testing.ts`).
- To see events from a dev build, run a local PostHog: `docs/local-posthog.md`.
- Missing or odd telemetry → `docs/observability-debugging.md` first.

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

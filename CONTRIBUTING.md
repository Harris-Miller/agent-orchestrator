# Contributing to HOA

Thanks for helping out. This guide covers setting up the repo, running the apps locally, and getting a pull request merged. For what HOA does, see the [README](./README.md) and the [docs site](https://harris-miller.github.io/hoa/).

Using a coding agent? It reads [`AGENTS.md`](./AGENTS.md) (`CLAUDE.md` is a symlink to it), which holds the same rules in more detail. Everything here applies to agent-written changes too.

## Prerequisites

| Requirement                                                                                   | Notes                                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Node.js 22+** and **npm**                                                                   | CI uses Node 24. The apps also need them at runtime to download and run agents.       |
| **pnpm**, at the version in `package.json` → `packageManager`                                 | `corepack enable` picks it up automatically.                                          |
| **Rust** and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS | Only for the desktop app. Not needed for the VS Code extension, the website or tests. |
| **VS Code 1.140+**                                                                            | Only for the VS Code extension.                                                       |
| An account with at least one agent provider (Codex or Claude)                                 | To actually run agents.                                                               |

## Setup

```sh
git clone https://github.com/Harris-Miller/hoa.git   # or your fork
cd hoa
git checkout develop
pnpm install        # also runs `prepare` (patches TypeScript for @effect/tsgo)
pnpm run local-ci   # sanity check: should pass on a fresh clone
```

## Repo layout

A [Turborepo](https://turborepo.com/) + pnpm workspaces monorepo.

| Path                                                | What it is                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/desktop`                                      | Tauri + React desktop app (the Agent Harness)                                    |
| `apps/vscode`                                       | VS Code extension: the same app in the Secondary Side Bar                        |
| `apps/website`                                      | VitePress docs site, deployed to GitHub Pages                                    |
| `libs/ui`                                           | Shared React UI and Harness application state used by both apps                  |
| `libs/effect-acp`                                   | Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) |
| `libs/hoa-home`                                     | HOA's on-disk home (`~/.hoa`): settings, Projects, provider runtimes             |
| `libs/hub`                                          | Machine-wide MCP hub process shared by every HOA client                          |
| `libs/context-services`                             | Portable host abstractions (Effect services)                                     |
| `libs/context-services-{node,tauri,vscode-webview}` | Live implementations of those services per host                                  |
| `libs/analytics-posthog`                            | PostHog implementation of product Analytics                                      |
| `tooling/`                                          | Shared Oxlint, tsconfig and Vitest config                                        |
| `docs/`                                             | System-wide ADRs, research notes, and dev guides                                 |

[`GLOSSARY-MAP.md`](./GLOSSARY-MAP.md) indexes each package's `GLOSSARY.md` and explains how the packages relate. Read the relevant glossary before you work in a package.

## Running locally

### Desktop app

```sh
pnpm run tauri:dev
```

Frontend changes (`apps/desktop/src`, `libs/*`) hot-reload; Rust changes (`apps/desktop/src-tauri`) rebuild and restart the app.

> [!WARNING]
> **Don't use a `tauri:dev` HOA to have agents edit this same checkout.** Every edit an agent makes triggers a reload or a Rust rebuild, which restarts the app and kills the agent sessions mid-turn. To work on HOA with HOA, run the dev app from a separate clone or git worktree, or use a built app (`pnpm run tauri:build`, or an installed release).

`pnpm run tauri:build` produces an installable bundle (it also packages the VS Code extension, which the desktop app ships with).

### VS Code extension

```sh
pnpm run vscode:dev    # terminal 1: extension host + webview watchers
pnpm run vscode:open   # terminal 2: launch an Extension Development Host
```

Or press **F5 → Run Extension** in VS Code.

Without watchers running, `pnpm run vscode:build:dev` then `pnpm run vscode:open` runs a development-mode build.

See [`apps/vscode/DEVELOPMENT.md`](./apps/vscode/DEVELOPMENT.md) for debugging, reload rules and installing a `.vsix`.

### Website

```sh
pnpm run website                            # build + preview at http://localhost:4173/
pnpm --filter=@apps/website dev             # hot reload
```

Pages live in `apps/website/content/`. See [`apps/website/README.md`](./apps/website/README.md).

### Environment and beta flags

Each app's committed `.env.development` sets dev defaults, including the beta-agent flags `HOA_ANTIGRAVITY_BETA` and `HOA_CURSOR_BETA`. Put personal overrides and secrets in a gitignored `.env` next to it (for example `POSTHOG_PROJECT_TOKEN`). Never commit a `.env`.

### Observability (optional)

Dev builds export OpenTelemetry logs and traces to `http://127.0.0.1:4318`. To see them, run the bundled Grafana stack:

```sh
docker compose up -d   # Grafana at http://localhost:3000
```

Product analytics go to a PostHog you run yourself; with no token set they are a no-op. See [`docs/local-posthog.md`](./docs/local-posthog.md) and [`docs/observability-debugging.md`](./docs/observability-debugging.md).

The MCP servers in `.mcp.json` and `.codex/config.toml` (Tauri, Grafana, Tempo, Chrome DevTools, PostHog) are for coding agents and expect these local services. You don't need them to contribute.

## Making a change

### Branches

The repo uses gitflow ([`docs/gitflow.md`](./docs/gitflow.md)):

- **`develop`** is the default branch. Branch from it and open your PR **into `develop`**.
- **`main`** is the release branch. Only release PRs from `develop` merge into it.

Name your branch after what it does, with the issue number if there is one (for example `fix-subagent-tracking-459`).

### Issues

Bugs and features are tracked in [GitHub Issues](https://github.com/Harris-Miller/hoa/issues). For anything bigger than a small fix, open or comment on an issue first so we can agree on the approach.

### Before you open a pull request

```sh
pnpm run lint       # Oxlint with --fix
pnpm run fmt        # Oxfmt, whole repository
pnpm run local-ci   # fmt:check + typecheck + lint:check + test — must pass
```

CI runs `local-ci` and builds the website on every PR. If you changed `package.json` dependencies, run `pnpm install` and commit the updated `pnpm-lock.yaml`; never edit the lockfile by hand.

### Pull request title

The PR title becomes the squash commit on `develop`, and release CI reads it to decide the next version and write the release notes. It must look like:

```
<Tag>: <Short description>
```

| Tag        | Use for                                    | Triggers a release |
| ---------- | ------------------------------------------ | ------------------ |
| `New`      | A new feature                              | yes                |
| `Update`   | A change to an existing feature            | yes                |
| `Fix`      | A bug fix                                  | yes                |
| `Breaking` | A change that breaks settings or user data | yes                |
| `Docs`     | Documentation only                         | no                 |
| `Build`    | Build, CI, or release tooling              | no                 |
| `Upgrade`  | Dependency upgrades                        | no                 |
| `Chore`    | Refactors, tests, and other internal work  | no                 |

For example: `Fix: Keep queued prompts after a turn is cancelled`. The `PR title` check fails until the title matches. If the PR is related to an issue, the PR body must start with `Closes #123` (one line per issue; use `Refs #123` only when the PR resolves part of it).

Never bump a version yourself: versions come from git tags at release time ([`apps/desktop/docs/alpha-release.md`](./apps/desktop/docs/alpha-release.md)).

## Conventions

The full list is in [`AGENTS.md`](./AGENTS.md). The ones reviewers check most:

- **Effect everywhere.** Read `node_modules/effect/AGENTS.md` before writing Effect code. Tests that run an Effect use `it.effect` from `@effect/vitest`, never `async` + `Effect.runPromise`.
- **Domain language.** Use the terms in the package's `GLOSSARY.md` in code, UI copy, issues and PRs.
- **Decisions as ADRs.** System-wide ADRs live in [`docs/adr/`](./docs/adr/), package-scoped ones in each package's `docs/adr/`. If your change contradicts an ADR, say so in the PR.
- **One theme source.** Every color comes from `libs/ui/src/theme/themes.ts`; components read `theme.palette.*` with no fallbacks.
- **Telemetry.** New user-facing actions get an Analytics event from the catalog in `libs/ui/src/analytics/catalog.ts`. Never put prompt text, paths, titles or ids in events or unredacted logs.
- **Cross-platform.** HOA runs on macOS and Windows. Build paths with `join()` / `resolve()`, in tests too.
- **No migrations yet.** Until Beta, settings and on-disk formats can change without migration code.

## License

By contributing, you agree that your contributions are licensed under the repository's [ISC License](./LICENSE).

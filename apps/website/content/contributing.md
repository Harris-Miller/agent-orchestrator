# Develop HOA

HOA is developed on [GitHub](https://github.com/Harris-Miller/hoa), where its issues live too. The full guide is [`CONTRIBUTING.md`](https://github.com/Harris-Miller/hoa/blob/develop/CONTRIBUTING.md) in the repository.

## Setup

You need Node.js 22+ with npm, pnpm, and (for the desktop app) Rust with the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
git clone https://github.com/Harris-Miller/hoa.git
cd hoa
git checkout develop
pnpm install
pnpm run tauri:dev    # desktop app
pnpm run vscode:dev   # VS Code extension: host + webview watchers
pnpm run vscode:open  # launch an Extension Development Host (second terminal)
```

::: warning Don't let a dev build edit itself
A `pnpm run tauri:dev` app reloads on every frontend edit and restarts on every Rust edit. If agents in that app edit the same checkout, their sessions die mid-turn. To work on HOA with HOA, run the dev app from a separate clone or git worktree, or use a built app.
:::

## Branches and pull requests

- Branch from **`develop`** and open your pull request into `develop`. `main` only takes release merges.
- Title the pull request `<Tag>: <Short description>`, for example `Fix: Keep queued prompts after a turn is cancelled`. The tag decides whether the change ships in the next release: `New`, `Update`, `Fix` and `Breaking` do; `Docs`, `Build`, `Upgrade` and `Chore` don't.

Before you open it:

```sh
pnpm run lint       # Oxlint with --fix
pnpm run fmt        # Oxfmt, whole repository
pnpm run local-ci   # fmt:check + typecheck + lint:check + test — must pass
```

CI runs `local-ci`, builds this website, and checks the title on every pull request.

## Conventions

- **Effect everywhere.** Read `node_modules/effect/AGENTS.md` before writing Effect code. Tests use `@effect/vitest`'s `it.effect`, never `async` + `Effect.runPromise`.
- **Domain language.** Each package has a `GLOSSARY.md`; `GLOSSARY-MAP.md` at the root indexes them. Use the glossary's terms in code, UI copy and issues.
- **Decisions as ADRs.** System-wide ADRs live in `docs/adr/`, package-scoped ones under each package's `docs/adr/`.
- **One theme source.** Every color comes from `libs/ui/src/theme/themes.ts`; components read `theme.palette.*` with no fallbacks.
- **Agents welcome.** Coding agents follow `AGENTS.md` (`CLAUDE.md` links to it), which holds these rules in full.

## This website

This site is a [VitePress](https://vitepress.dev/) app in `apps/website`. Its pages are the Markdown files in `apps/website/content/`, and it deploys to GitHub Pages with each release.

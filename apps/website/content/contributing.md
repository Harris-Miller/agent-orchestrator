# Develop HOA

HOA is developed in the open on [GitHub](https://github.com/Harris-Miller/agent-orchestrator). Issues live there too.

## Setup

```sh
pnpm install
pnpm run tauri:dev    # desktop app
pnpm run vscode:dev   # VS Code extension: host + webview watchers
pnpm run vscode:open  # launch an Extension Development Host (second terminal)
```

## Before you open a pull request

```sh
pnpm run lint       # Oxlint with --fix
pnpm run fmt        # Oxfmt, whole repository
pnpm run local-ci   # fmt:check + typecheck + lint:check + test — must pass
```

CI runs `local-ci` on every pull request.

## Conventions

- **Effect everywhere.** Read `node_modules/effect/AGENTS.md` before writing Effect code. Tests use `@effect/vitest`'s `it.effect`, never `async` + `Effect.runPromise`.
- **Domain language.** Each package has a `GLOSSARY.md`; `GLOSSARY-MAP.md` at the root indexes them. Use the glossary's terms in code, UI copy and issues.
- **Decisions as ADRs.** System-wide ADRs live in `docs/adr/`, package-scoped ones under each package's `docs/adr/`.
- **One theme source.** Every color comes from `libs/ui/src/theme/themes.ts`; components read `theme.palette.*` with no fallbacks.

## This website

This site is a [VitePress](https://vitepress.dev/) app in `apps/website`. Its pages are the Markdown files in `apps/website/content/`.

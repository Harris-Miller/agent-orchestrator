# AGENTS.md

## Top Level Instructions

* `pnpm run local-ci` should pass before work is considered done
* Lint every changed file with ESLint `--fix` before work is considered done. Package `lint` scripts are `eslint . …`, so extra args after `pnpm run lint --` do not replace `.` — call ESLint per owning package instead, e.g. `pnpm --filter=@app/web exec eslint --max-warnings 0 --fix path/rel/to/file.ts` (paths relative to that package; repeat per package when changes span packages)
* NEVER manually update `pnpm-lock.yaml`. If you do update `package.json` `"dependencies"` or `"devDependencies"`, run `pnpm i` after
* NEVER manually update anything under `.agents/` — it is an immutable dependency folder (skills/guides are read-only reference; do not edit, patch, or “improve” files there)

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

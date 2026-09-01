# No `node:*` imports in `apps/desktop/src`

Code under `apps/desktop/src` runs in the **WebView runtime** (see `CONTEXT.md`), not Node.js. Imports such as `node:path`, `node:url`, or `node:fs` assume a Node host that is not present at runtime and blur the boundary between the WebView bundle and the Tauri host.

Host capabilities (cwd, env, paths, filesystem, child processes) must go through **Tauri services** — portable `@lib/context-services` abstractions with live layers in `src/context-services/` backed by Tauri plugins — or through explicit Tauri IPC where no portable service exists yet. Path resolution uses `OS` + `Path` + `FileSystem`, not `import.meta.url` translated via Node URL helpers.

`tsconfig.app.json` for `src` must not include `@types/node` in `compilerOptions.types`; only WebView-oriented types (e.g. `vite/client`) belong there. Rust in `src-tauri/` is out of scope for this rule.

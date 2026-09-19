# VS Code extension scaffolding for local development (pnpm/turborepo)

Date: 2026-09-17  
Question: How do we scaffold and **load locally** a TypeScript VS Code extension under `apps/vscode` in this pnpm/turborepo monorepo — without Marketplace publishing?

Scope: local Extension Development Host, CLI `--extensionDevelopmentPath`, and installing a packaged `.vsix`. Not covered: Marketplace auth/publish.

## Summary

| Goal | Official path |
| --- | --- |
| Scaffold | `npx --package yo --package generator-code -- yo code` (TypeScript; bundler optional) |
| Minimal runtime layout | `package.json` with `engines.vscode`, `main`, `contributes`; `src/extension.ts` → compiled JS |
| Day-to-day debug | F5 / `extensionHost` launch with `--extensionDevelopmentPath=${workspaceFolder}` |
| CLI load without install | `code --extensionDevelopmentPath=<extension-root>` |
| Shareable local binary | `vsce package` → `.vsix`, then `code --install-extension path.vsix` (no Marketplace) |

**Verdict for this repo:** Put the extension at `apps/vscode` with its own manifest/`main`. Prefer **esbuild bundle** for monorepo packaging (`--no-dependencies` / ignore `node_modules`), or plain **tsc** like the official Hello World sample for the smallest start. Marketplace is optional; packaging alone is enough for local install.

## 1. Minimal project layout

### Scaffold

Official “Your First Extension” uses Yeoman `generator-code` ([Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)):

```bash
npx --package yo --package generator-code -- yo code
```

Prompts include: New Extension (TypeScript), identifier, **bundler** (`unbundled` default in the walkthrough), package manager.

### File tree (Hello World)

From [Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy):

```
.
├── .vscode/
│   ├── launch.json     # Extension Development Host
│   └── tasks.json      # compile/watch
├── src/
│   └── extension.ts
├── package.json        # Extension Manifest
└── tsconfig.json
```

### Manifest fields that matter

Required / core VS Code fields ([Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest); Anatomy sample):

| Field | Role |
| --- | --- |
| `name`, `publisher`, `version` | Identity; Marketplace ID is `publisher.name` |
| `engines.vscode` | **Required**; min API version (cannot be `*`). Mismatch → extension may not load ([Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)) |
| `main` | Node extension host entry (e.g. `./out/extension.js`) ([Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)) |
| `contributes` | Static contributions (commands, views, …) |
| `activationEvents` | When to activate; can be `[]` for command-only extensions on VS Code ≥ 1.74 |

Current official Hello World sample ([vscode-extension-samples/helloworld-sample/package.json](https://raw.githubusercontent.com/microsoft/vscode-extension-samples/main/helloworld-sample/package.json)):

- `"activationEvents": []` — since VS Code **1.74.0**, commands in `contributes.commands` auto-activate without explicit `onCommand` ([Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy); [Activation Events](https://code.visualstudio.com/api/references/activation-events))
- `"main": "./out/extension.js"`
- `"engines": { "vscode": "^1.100.0" }` (sample; pin to what you target)
- Scripts: `compile` / `watch` via `tsc`, plus `vscode:prepublish`

Entry module must export `activate` (and optionally `deactivate`) ([Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)).

## 2. TypeScript build: `tsc` vs esbuild

| Approach | Official stance | Typical `main` |
| --- | --- | --- |
| **Unbundled `tsc`** | Default Hello World / Anatomy sample | `./out/extension.js` |
| **esbuild** | Recommended bundler guide; required for web/single-file load | `./dist/extension.js` |
| **webpack** | Also documented | `./dist/extension.js` |

**Hello World (unbundled):** ([Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy); [helloworld-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/helloworld-sample))

```json
"scripts": {
  "vscode:prepublish": "npm run compile",
  "compile": "tsc -p ./",
  "watch": "tsc -watch -p ./"
}
```

**esbuild (official bundling guide):** ([Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension))

- Bundle `src/extension.ts` → `dist/extension.js`, `external: ['vscode']`, `platform: 'node'`, `format: 'cjs'`
- Run **`tsc --noEmit`** separately (esbuild strips types, does not typecheck)
- Scripts pattern from that guide:

```json
"scripts": {
  "compile": "npm run check-types && node esbuild.js",
  "check-types": "tsc --noEmit",
  "watch": "npm-run-all -p watch:*",
  "watch:esbuild": "node esbuild.js --watch",
  "watch:tsc": "tsc --noEmit --watch --project tsconfig.json",
  "vscode:prepublish": "npm run package",
  "package": "npm run check-types && node esbuild.js --production"
}
```

Generator prompt “Which bundler to use?” includes unbundled vs bundler options ([Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)).

**Monorepo lean:** Bundle with esbuild so the VSIX does not need to resolve workspace/`node_modules` trees (see §6).

## 3. Run / debug locally after build

### A. F5 — Extension Development Host

1. Open the extension folder (or a multi-root workspace that includes it).
2. Press **F5** or **Debug: Start Debugging** ([Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)).
3. VS Code compiles (via preLaunchTask) and opens a second window: the Extension Development Host.

Official sample `launch.json` ([helloworld-sample/.vscode/launch.json](https://raw.githubusercontent.com/microsoft/vscode-extension-samples/main/helloworld-sample/.vscode/launch.json)):

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "Run Extension",
    "type": "extensionHost",
    "request": "launch",
    "runtimeExecutable": "${execPath}",
    "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
    "outFiles": ["${workspaceFolder}/out/**/*.js"],
    "preLaunchTask": "npm: watch"
  }]
}
```

After edits: **Developer: Reload Window** in the host window ([Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)).

**Monorepo note:** `${workspaceFolder}` must be the **extension package root** (where `package.json` + `main` live), not the turborepo root — use a multi-root workspace or a launch config with an absolute/`${workspaceFolder:apps/vscode}`-style folder name if the IDE workspace root is the monorepo.

### B. CLI: `--extensionDevelopmentPath`

Same switch the debugger passes. Documented for tests and host launch ([Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)):

```bash
code --extensionDevelopmentPath=<EXTENSION-ROOT-PATH>
```

Loads the unpacked extension from that folder (must contain the Extension Manifest). For tests, pair with `--extensionTestsPath`.

### C. Install a local `.vsix` (not Marketplace)

1. Package: `vsce package` → `name-version.vsix` in the extension root ([Publishing Extensions — Packaging](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)).
2. Install:

```bash
code --install-extension my-extension-0.0.1.vsix
```

Also: Command Palette **Extensions: Install from VSIX…** ([Extension Marketplace — Install from a VSIX](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)).

CLI docs: `--install-extension` accepts `publisher.extension` **or a path to a VSIX** ([Command Line Interface](https://code.visualstudio.com/docs/configure/command-line)).

## 4. What `vsce package` produces (no Marketplace required)

[`@vscode/vsce`](https://github.com/microsoft/vscode-vsce) is the packaging/publishing CLI; docs live on the VS Code site ([Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension); [vsce README](https://github.com/microsoft/vscode-vsce/blob/main/README.md)).

Install and package:

```bash
npm install -g @vscode/vsce   # or: npx @vscode/vsce …
cd <extension-root>
vsce package
# → e.g. my-extension-0.0.1.vsix
```

Official packaging reasons ([Publishing Extensions — Packaging extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)):

- Test on your VS Code instance
- **Distribute without publishing to the Marketplace**
- Share privately

`vsce publish` is separate and needs a Marketplace publisher/credentials. **Local load never requires publish.**

`vscode:prepublish` in `package.json` runs on every package ([Publishing Extensions — Pre-publish step](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)).

## 5. Recommended scripts

| Script | Unbundled (`tsc`) | Bundled (esbuild guide) |
| --- | --- | --- |
| `compile` | `tsc -p ./` | `check-types` + `esbuild.js` |
| `watch` | `tsc -watch -p ./` | parallel esbuild watch + `tsc --noEmit --watch` |
| `package` / `vscode:prepublish` | `npm run compile` | production esbuild (`--production`) |
| CLI package | `vsce package` (invokes `vscode:prepublish`) | same |

Sources: [Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy), [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension), [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

Optional integration tests: `@vscode/test-cli` + `@vscode/test-electron`, `vscode-test` script ([Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)) — not required for local load.

## 6. Monorepo gotchas (`apps/vscode`)

Claims below are from first-party docs / `@vscode/vsce` behavior — not Marketplace-specific.

1. **Package from the extension root**  
   `vsce package` must run in the folder that contains the extension `package.json` ([Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)). In a turborepo, that is `apps/vscode`, not the repo root.

2. **`.vscodeignore` vs `package.json` `files`**  
   - `.vscodeignore`: glob denylist; ignore non-runtime files (e.g. `**/*.ts`) ([Publishing Extensions — Using .vscodeignore](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)).  
   - Bundled extensions: exclude `node_modules`, `src/`, build configs; keep `dist/` ([Bundling Extensions — Publishing](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)):

     ```
     .vscode
     node_modules
     out/
     src/
     tsconfig.json
     esbuild.js
     ```

   - `@vscode/vsce` supports either `.vscodeignore` **or** `package.json` `"files"` (allowlist), **not both** — combining them errors ([vsce `printAndValidatePackagedFiles`](https://github.com/microsoft/vscode-vsce/blob/main/src/package.ts)). Prefer one strategy; `vsce ls` is useful to inspect contents.

3. **Package managers**  
   Official FAQ: **npm or yarn v1** for dependency packaging ([Publishing Extensions FAQ](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)). This monorepo uses **pnpm**. Practical first-party guidance from vscode-vsce maintainers for bundled extensions: use **`--no-dependencies`** when deps are already in the bundle ([vscode-vsce#758](https://github.com/microsoft/vscode-vsce/issues/758)). That pairs cleanly with the official esbuild/webpack recommendation to drop `node_modules` from the VSIX.

4. **Hoisted / parent `node_modules`**  
   Unbundled packaging that walks `node_modules` assumes a layout vsce understands; nested packages with root-only install trees are a known pain point (see vscode-vsce monorepo/pnpm discussions). **Bundle + `--no-dependencies` + tight `.vscodeignore`** is the path that stays aligned with official bundling docs.

5. **`publisher` still required in the manifest**  
   Manifest lists `publisher` as required ([Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)). Needed for packaging/identity even when you never publish.

6. **F5 workspace root**  
   Launch `args` use `--extensionDevelopmentPath=${workspaceFolder}` ([helloworld sample](https://raw.githubusercontent.com/microsoft/vscode-extension-samples/main/helloworld-sample/.vscode/launch.json)). If Cursor/VS Code opens the monorepo root, point that arg at `apps/vscode` explicitly.

## Local load cookbook

Assume package at `apps/vscode`.

```bash
# 0) One-time scaffold (or hand-roll Anatomy layout)
cd apps
npx --package yo --package generator-code -- yo code
# → choose TypeScript; prefer esbuild if monorepo deps; move/rename to vscode

# 1) Install + build (from extension package)
cd apps/vscode
pnpm install          # via workspace as usual
pnpm run build        # or: watch:main / watch:renderer

# 2a) Debug: open extension folder (or multi-root), press F5
#     launch.json args include --extensionDevelopmentPath=<this folder>

# 2b) CLI Extension Development Host (unpacked, no install)
code --extensionDevelopmentPath="$(pwd)"

# 3) Optional: package + install locally (still no Marketplace)
pnpm exec vsce package --no-dependencies   # if esbuild-bundled
code --install-extension ./*.vsix
# or: Extensions: Install from VSIX…
```

Reload host window after rebuilds; bump `engines.vscode` if the Hello World command is missing ([Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension)).

## Primary sources

- [Your First Extension](https://code.visualstudio.com/api/get-started/your-first-extension) — yo/generator-code, F5, reload
- [Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy) — layout, manifest, `tsc` scripts, activate
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest) — required fields
- [Activation Events](https://code.visualstudio.com/api/references/activation-events) — implicit command activation ≥ 1.74
- [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) — esbuild/webpack, scripts, `.vscodeignore`
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) — `@vscode/vsce`, `vsce package`, VSIX install, `.vscodeignore`, `vscode:prepublish`, package-manager FAQ
- [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) — `--extensionDevelopmentPath`, test launch.json
- [Command Line Interface](https://code.visualstudio.com/docs/configure/command-line) — `--install-extension`
- [Extension Marketplace — Install from a VSIX](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)
- [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host) — `main` / Node host
- [@vscode/vsce](https://github.com/microsoft/vscode-vsce) / [package.ts validation](https://github.com/microsoft/vscode-vsce/blob/main/src/package.ts) — `files` vs `.vscodeignore`
- [helloworld-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/helloworld-sample) — reference `package.json` + `launch.json`

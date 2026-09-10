# Resolve bundled ACP adapter resources across Tauri and VS Code

Date: 2026-09-03  
Question: How should shared Harness code resolve packaged `@agentclientprotocol/claude-agent-acp` / `@agentclientprotocol/codex-acp` entry files without calling Tauri `resolveResource` directly, so the same launch path can run under Tauri desktop and a VS Code extension host via Effect Context/Layer?

## Summary

| Runtime | How packaged files are located | Primary API |
| --- | --- | --- |
| **Tauri** | Bundled under `$RESOURCE` via `bundle.resources`; path resolved at runtime | `resolveResource(resourcePath)` → `plugin:path\|resolve_directory` with `BaseDirectory.Resource` |
| **VS Code (desktop / remote Node host)** | Files shipped inside the extension install directory; absolute FS path for `node <entry>` | `ExtensionContext.asAbsolutePath(relative)` or `Uri.joinPath(extensionUri, …).fsPath` |

**Fact:** Shared UI / launch code must not import `@tauri-apps/api/path`. Resource location is a host concern — same shape as existing `OS` / Path / FileSystem services.

**Recommendation (ponytail):** One portable Effect service (e.g. `BundledResource`) in `@lib/context-services` with `resolve(relativePath): Effect<string, …>`. Tauri Layer wraps existing `resolveResource`. VS Code Layer wraps `context.asAbsolutePath` (or `extensionUri` + `fsPath` when scheme is `file`). Keep adapters as an opaque `node_modules` tree spawned via `node <entry>` — do not webpack/esbuild them into the extension host bundle. For `session/new` cwd in VS Code, pass an absolute workspace folder path (`workspaceFolders[0].uri` when `file`), not extension-host `process.cwd()`.

---

## A. What Tauri `resolveResource` actually does

### Official JS API

- Docs: https://tauri.app/reference/javascript/api/namespacepath  
- `resolveResource(resourcePath: string): Promise<string>` — “Resolve the path to a resource file.” Path **must follow the same syntax** as `tauri.conf.json > bundle > resources` (keep subfolders / `../` components). Returns the full path to the resource.  
- `resourceDir(): Promise<string>` — application resource directory; platform notes (Windows = exe dir; macOS = `${exe_dir}/../Resources`; Linux AppImage / install / debug paths documented). Doc states the exact path is **not a contract**.

### Implementation (installed package)

From `@tauri-apps/api@2.11.1` `path.js`:

```js
async function resolveResource(resourcePath) {
  return invoke('plugin:path|resolve_directory', {
    directory: BaseDirectory.Resource,
    path: resourcePath,
  });
}
```

Source: `node_modules/.pnpm/@tauri-apps+api@2.11.1/node_modules/@tauri-apps/api/path.js` (around the `resolveResource` export). Same invoke pattern as `resourceDir()`, which omits `path` and only passes `BaseDirectory.Resource`.

### `bundle.resources` mapping

Official guide: https://tauri.app/develop/resources

- Array form: original relative structure preserved under `$RESOURCE` (example: `./path/to/some-file.txt` → `$RESOURCE/path/to/some-file.txt`).  
- Map form: `"source": "destUnderResource"` controls copy destination.  
- Resolve APIs use the **same path syntax** as the config (relative path → `$RESOURCE/…`).

### Current usage in this repo

**Config** — `apps/desktop/src-tauri/tauri.conf.json`:

```json
"resources": {
  "../acp-adapter-resources/node_modules": "acp-adapter-resources/node_modules"
}
```

`beforeDevCommand` / `beforeBuildCommand` run `materialize-acp-adapters` then Vite.

**Launch** — `apps/desktop/src/acp/acpAdapterCommand.ts`:

- Relative resource keys:

  - `acp-adapter-resources/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js`
  - `acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js`

- Resolves with `resolveResource(resourcePath)`, then `ChildProcess.make('node', [entry], …)` plus `CODEX_PATH` / `CLAUDE_CODE_EXECUTABLE` from PATH detection.

**Packaging rationale** — `apps/desktop/docs/adr/0006-acp-adapters-as-tauri-resources.md` and `apps/desktop/CONTEXT.md` (“Adapter resource tree”): isolated pnpm project at `apps/desktop/acp-adapter-resources` with `nodeLinker: hoisted` so the tree is real directories (store symlinks would be dropped by the resource bundler). Script: `pnpm --dir acp-adapter-resources install --frozen-lockfile --prod` (`apps/desktop/package.json`).

**Note:** Capabilities currently allow shell spawn of `node` (`apps/desktop/src-tauri/capabilities/default.json`). Reading the adapter entry goes through path resolve + spawn, not necessarily the fs plugin’s `$RESOURCE` ACL (fs resource permissions are documented for `readTextFile`-style access in https://tauri.app/develop/resources).

---

## B. VS Code extension equivalent

### Locating files packaged inside the extension

Primary API reference: https://code.visualstudio.com/api/references/vscode-api

| API | Role |
| --- | --- |
| `ExtensionContext.extensionUri` | URI of the directory containing the extension |
| `ExtensionContext.extensionPath` | Absolute FS path; documented as shorthand for `extensionUri.fsPath` (independent of uri scheme) |
| `ExtensionContext.asAbsolutePath(relativePath)` | Absolute path of a resource **contained in the extension** |
| `Uri.joinPath(base, …pathSegments)` | Join URI path segments; preferred for constructing URIs |
| `extensions.getExtension(id)` | Look up another extension; exposes `extensionUri` / `extensionPath` |

Official note on `asAbsolutePath`: an absolute URI can also be built via `Uri.joinPath(context.extensionUri, relativePath)`.

**Typical pattern for shipping a Node entry and running it:** Language Server Extension Guide uses:

```ts
let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
```

then launches that module under the language client / Node IPC transport.  
Source: https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

Webview media uses `Uri.joinPath(context.extensionUri, 'media', …)` (URI, not always a spawn path): https://code.visualstudio.com/api/extension-guides/webview

### Extension host / spawn constraints

- Local and remote extension hosts run a **Node.js** runtime (`main` entry). Web host is a Browser WebWorker (`browser` entry) — no Node `child_process`.  
  Source: https://code.visualstudio.com/api/advanced-topics/extension-host  
- Process sandboxing write-up: extension host is an isolated process; “extensions are free to spawn as many child processes as they require.”  
  Source: https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox  
- Remote / Codespaces: spawning can run on the **wrong side** if the extension is workspace-remote; native modules need Electron rebuild locally vs plain Node on VS Code Server. Prefer `extensionKind` / dual binaries when shipping natives.  
  Source: https://code.visualstudio.com/api/advanced-topics/remote-extensions  
- Virtual workspaces: do not assume `file` scheme; `URI.fsPath` only when scheme is `file`; disable or limit commands that need disk / executables.  
  Source: https://code.visualstudio.com/api/extension-guides/virtual-workspaces  

**Implication for ACP adapters:** spawn `node` + packaged entry only on a Node extension host with a `file`-scheme workspace (or accept that virtual/web workspaces are unsupported — declare `capabilities.virtualWorkspaces` accordingly).

### Packaging (`vsce` / `.vscodeignore`)

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension — `.vscodeignore` excludes files from the VSIX; `vscode:prepublish` runs before package; `devDependencies` auto-ignored; Windows packaging can drop POSIX executable bits on bundled files.  
- https://code.visualstudio.com/api/working-with-extensions/bundling-extension — after esbuild/webpack, typical `.vscodeignore` excludes `node_modules` because deps are inlined into `dist/extension.js`. **Exception called out:** modules that cannot be bundled must stay on disk and be **un-ignored** (e.g. `!node_modules/mySpecialModule`).  
- Manifest `dependencies` are “Exactly the same as npm's dependencies” (runtime Node deps): https://code.visualstudio.com/api/references/extension-manifest  

**Practical packaging for adapters:** treat the adapter tree like the “unbundled special module” case — copy/materialize `acp-adapter-resources/node_modules` into the extension package and keep it out of the esbuild/webpack graph (`external` / never imported by the host bundle).

### Workspace folder as `session/new` cwd

- `workspace.workspaceFolders: readonly WorkspaceFolder[] | undefined` — list of roots; `undefined` when none open.  
- `WorkspaceFolder`: `{ index, name, uri }` — **“All workspace folders are equal”** (no primary/active). URI chosen so non-disk folders are possible later.  
  Source: https://code.visualstudio.com/api/references/vscode-api (`WorkspaceFolder`, `workspace.workspaceFolders`)  
- Multi-root product docs: extensions that don’t adopt multi-root still “work in the first folder.”  
  Source: https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces  
- Tree View sample uses `workspaceFolders[0].uri.fsPath` when length > 0: https://code.visualstudio.com/api/extension-guides/tree-view  

**Caveats (facts):** empty workspace → no folder cwd; multi-root → pick explicitly (first folder is convention, not protocol); non-`file` URI → no safe absolute FS cwd for adapters that expect disk paths.

---

## C. Effect DI pattern for this abstraction

### Effect guidance (primary)

`node_modules/effect/AGENTS.md` — prefer services for modular behaviour; default definition is `Context.Service` with an interface and `Layer.effect` / `Service.of` implementations. Use `Effect.fn` for methods. Compose with `Layer.provide` / `Layer.provideMerge`.

This repo’s Effect generation already uses `Context.Service` for portable tags (not the older Tag-only style in every file):

```ts
// libs/context-services/src/OS.ts
export const OS = Context.Service<OS>('OS');
```

Live layers:

- Node: `Layer.succeed(OS, { … })` — `libs/context-services-node/src/OSLive.ts`  
- Tauri: `Layer.effect(OS, Effect.gen(…))` wrapping invokes — `libs/context-services-tauri/src/OSLive.ts`  
- Aggregate: `libs/context-services-tauri/src/TauriServices.ts` merges OS / Path / FileSystem / ChildProcessSpawner (documented as analogous to `@effect/platform-node`’s `NodeServices.layer`)

Context map: portable service in `libs/context-services`; Node live in `libs/context-services-node`; Tauri live in `libs/context-services-tauri` (`CONTEXT-MAP.md`).

### How tests mock `resolveResource` today

`apps/desktop/src/acp/findExecutableOnPath.test.ts`:

- `vi.mock('@tauri-apps/api/path', () => ({ resolveResource: vi.fn() }))`  
- `makeAcpAdapterCommand` tests stub resolved absolute paths  
- PATH / FS still use Effect `Layer.succeed(OS, …)` + `layerNoop` FileSystem — already DI for those deps

**With a BundledResource service:** drop `vi.mock` of Tauri; provide `Layer.succeed(BundledResource, { resolve: (p) => Effect.succeed(`/resources/${p}`) })` (or map known backends). Matches how OS is already tested.

### Recommended service shape (recommendation)

Minimal — same grain as `OS` (small interface, no Tauri/VS Code types in the portable package):

```ts
// sketch — portable tag in @lib/context-services
export interface BundledResource {
  /** Resolve a path relative to the host’s packaged resource root to an absolute FS path. */
  readonly resolve: (resourcePath: string) => Effect.Effect<string, BundledResourceMissing>
}

export const BundledResource = Context.Service<BundledResource>('BundledResource')
```

- Shared relative keys stay in one place (today’s `adapterEntryResource` map), or the service exposes `resolveAdapterEntry(backend)` if you want adapter IDs in the service — prefer keeping **generic path resolve** in the service and **backend→relative path** next to `makeAcpAdapterCommand` (YAGNI).  
- Errors: `Schema.TaggedError` like `MissingLaunchPrerequisite` / existing host errors.  
- Wire into `makeAcpAdapterCommand` via `yield* BundledResource` instead of `Effect.tryPromise(resolveResource)`.

**Layer homes:**

| Layer | Location (convention) |
| --- | --- |
| Tag + error types | `libs/context-services` |
| Tauri Live (`resolveResource`) | `libs/context-services-tauri` (e.g. `BundledResourceLive`); merge into `TauriServices` |
| VS Code Live (`asAbsolutePath` / `extensionUri`) | future extension package or `libs/context-services-vscode` (mirror `context-services-node`) |
| Test | `Layer.succeed(BundledResource, …)` in vitest |

---

## D. Packaging adapters for both runtimes

### Current Tauri setup (fact)

- Isolated project: `apps/desktop/acp-adapter-resources/` (`package.json` deps on the two ACP packages; `pnpm-workspace.yaml` sets `nodeLinker: hoisted`).  
- Materialize: `materialize-acp-adapters`.  
- Bundle map copies that `node_modules` into `$RESOURCE/acp-adapter-resources/node_modules`.  
- Runtime: `node` + resolved `dist/index.js`; vendor CLIs remain on user PATH.

### VS Code options (recommendation grounded in docs)

1. **Preferred (mirrors Tauri):** On `vscode:prepublish` / package script, materialize the same hoisted tree into e.g. `extension/acp-adapter-resources/node_modules`, ensure `.vscodeignore` does **not** exclude it (negate if a blanket `node_modules` ignore exists — bundling guide’s `!node_modules/mySpecialModule` pattern). Resolve with `asAbsolutePath('acp-adapter-resources/node_modules/@agentclientprotocol/…/dist/index.js')`. Spawn `node` with that absolute path (reuse `ChildProcess` / OS PATH helpers once Node layers exist on the extension host).  
2. **npm `dependencies` on the extension:** vsce can ship extension `dependencies`; still avoid bundling those packages into the host JS graph — treat them as external scripts. Hoisted layout may still matter if adapters expect classic `node_modules` resolution from their entry.  
3. **Do not** esbuild/webpack the adapter graphs into `dist/extension.js` — they are opaque stdio ACP servers with their own dependency trees; bundling guide’s “critical dependencies” / dynamic require warnings apply; native bits (if any) need platform-specific VSIX (`--target`) per publishing docs.

Shared relative path strings between Tauri resource keys and VS Code extension-relative paths reduce drift (today’s keys already start with `acp-adapter-resources/…`).

---

## E. ACP `session/new` and `cwd`

Primary: https://agentclientprotocol.com/protocol/v1/session-setup.md (index: https://agentclientprotocol.com/llms.txt)

Facts:

- Clients create a session with **working directory** + MCP servers.  
- **Working Directory:** `cwd` MUST be an **absolute** path; MUST be used for the session **regardless of where the Agent subprocess was spawned**; MUST remain the base for relative-path resolution; MUST be part of the session’s effective root set.  
- With `additionalDirectories`, `cwd` remains primary; additional entries are absolute paths expanding the root set.

This repo today: `createSession(agent, cwd)` forwards caller cwd; load/resume default via `sessionCwd` → `OS.cwd()` (host process cwd) for non-echo backends (`agentHarness.ts`). Desktop CONTEXT distinguishes **Host cwd** (Tauri process) from session project context; the create-session UI already picks a directory (`CreateSessionDirectoryPicker.tsx`).

**VS Code mapping (recommendation):** default `session/new` cwd = absolute `file` path of the relevant `WorkspaceFolder.uri` (single-root: only folder; multi-root: explicit pick or documented `[0]`). Do not use extension-host `process.cwd()` as the project root. Optionally pass sibling roots via ACP `additionalDirectories` when the agent advertises that capability.

---

## Recommended approach

1. **Add portable `BundledResource`** to `@lib/context-services` (`resolve(relativePath) → Effect<string, E>`), same style as `OS`.  
2. **Tauri:** `BundledResourceLive` = thin `Effect.tryPromise` around `resolveResource`; include in `TauriServices.layer`. Change `acpAdapterCommand.ts` to depend on the service only.  
3. **VS Code (when built):** Live Layer constructed in `activate(context)` with `asAbsolutePath` (or `Uri.joinPath(context.extensionUri, …).fsPath` after asserting `file`). Provide Node `OS` / process layers from `context-services-node` (or a vscode-specific OS if PATH/env must come from the remote host).  
4. **Package adapters** as a hoisted tree beside the extension (reuse `materialize-acp-adapters` idea); exclude from JS bundler; include in VSIX via `.vscodeignore` exceptions.  
5. **Tests:** replace `vi.mock('@tauri-apps/api/path')` with `Layer.succeed(BundledResource, …)`.  
6. **Session cwd:** VS Code Layer or caller supplies workspace folder absolute path into existing `createSession(agent, cwd)` — separate from resource resolve, but part of the same host-abstraction story.

No new npm dependency required for the abstraction itself; only Effect Context/Layer already in use.

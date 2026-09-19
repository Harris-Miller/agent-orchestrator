# VS Code extension persistence for an ACP session roster

Date: 2026-09-10  
Question: Do VS Code extensions have filesystem (or equivalent) access suitable for persisting an ACP session roster (e.g. for a future `apps/vscode`), comparable to what `apps/desktop` can do easily? Cover `ExtensionContext` storage APIs, Node `fs` in the extension host, remote considerations, and web-extension limits.

## Summary

**Yes — a future VS Code extension can persist a session roster across restarts**, using first-party `ExtensionContext` APIs. That is comparable in outcome to desktop in-app persistence, with two caveats: (1) prefer VS Code’s storage URIs + `vscode.workspace.fs` (not hard-coded `~/.vscode` paths) so remote/WSL/SSH keep working; (2) a **web** extension host has **no Node.js `fs`**, but still has Memento + storage URIs via `vscode.workspace.fs`.

| Mechanism | Best for | Survives restart? | Workspace required? | Remote-safe? | Web extension? |
| --- | --- | --- | --- | --- | --- |
| `globalState` / `workspaceState` (Memento) | Small JSON-friendly key/value (roster metadata) | Yes (VS Code restores) | `workspaceState` is workspace-scoped; `globalState` is cross-workspace | Yes if you use these APIs | Yes (full VS Code API) |
| `globalStorageUri` + `workspace.fs` | Larger / file-shaped data | Yes (files you write) | No (global) | Yes — “safe” URI; create dir yourself | Yes, but URI is on a **virtual** FS — must use `workspace.fs`, not Node `fs` |
| `storageUri` + `workspace.fs` | Workspace-private files | Yes | **Yes** — `undefined` when no folder/workspace open | Same as above | Same as above |
| Node `fs` / `path` against `*.fsPath` | Desktop/local Node host only | Yes if path exists | N/A | **Fragile** on remote/virtual; discouraged vs storage URIs | **No** — Node APIs unavailable |

**Verdict for ACP roster:** A thin JSON roster fits `globalState` (or `globalStorageUri` if it grows). Host-owned persistence is supported. If a shared ACP proxy owns the roster on disk, the VS Code host needs less of this.

## Data storage options (official five)

VS Code documents five storage options on `ExtensionContext` ([Common Capabilities — Data Storage](https://code.visualstudio.com/api/extension-capabilities/common-capabilities)):

1. **`workspaceState`** — key/value; restored when the same workspace is opened again.
2. **`globalState`** — key/value; restored on each extension activation; optional Settings Sync via `setKeysForSync`.
3. **`storageUri`** — workspace-specific directory URI; good for large files scoped to the current workspace.
4. **`globalStorageUri`** — global directory URI; good for large files accessible from all workspaces.
5. **`secrets`** — encrypted secret storage (not for a normal session roster; plaintext Memento is wrong for secrets).

The context is passed into `activate` ([same page](https://code.visualstudio.com/api/extension-capabilities/common-capabilities); [ExtensionContext](https://code.visualstudio.com/api/references/vscode-api#ExtensionContext)).

## Memento: `globalState` / `workspaceState`

API ([ExtensionContext](https://code.visualstudio.com/api/references/vscode-api#ExtensionContext), [Memento](https://code.visualstudio.com/api/references/vscode-api#Memento)):

- `globalState`: “stores state independent of the current opened workspace.”
- `workspaceState`: “stores state in the context of the currently opened workspace.”
- `Memento.get` / `update` / `keys`; `update` requires **JSON-stringifyable** values; `undefined` removes the key.
- `globalState` is typed as `Memento & { setKeysForSync }` for opt-in sync ([Common Capabilities](https://code.visualstudio.com/api/extension-capabilities/common-capabilities)).

Remote guidance: use these for simple key/value persistence so the extension “continue[s] to function regardless of where it runs” ([Remote extensions — Persisting extension data or state](https://code.visualstudio.com/api/advanced-topics/remote-extensions#_persisting-extension-data-or-state)).

**Roster fit:** A small list of session IDs / labels / last-used timestamps is a natural `globalState` value (or one key with a JSON array/object). Prefer `globalState` if the roster should outlive a single workspace window.

## File storage: `globalStorageUri` / `storageUri` + `vscode.workspace.fs`

API ([ExtensionContext](https://code.visualstudio.com/api/references/vscode-api#ExtensionContext)):

- **`globalStorageUri`**: URI of a directory for global state. Directory **might not exist**; extension must create it. Parent is guaranteed to exist. Docs point to `workspace.fs` for read/write. Prefer this over deprecated `globalStoragePath`.
- **`storageUri`**: URI of a **workspace-specific** private directory. Same create-yourself semantics. Prefer over deprecated `storagePath`.
- **When `storageUri` is undefined:** “The value is `undefined` when no workspace nor folder has been opened.”

`vscode.workspace.fs` is a `FileSystem` that “allows to interact with local and remote files” ([workspace.fs](https://code.visualstudio.com/api/references/vscode-api#workspace.fs); [FileSystem](https://code.visualstudio.com/api/references/vscode-api#FileSystem)) — including `createDirectory`, `writeFile`, `readFile`, etc.

Official remote sample: guard `if (!context.storageUri)`, `stat`/`createDirectory`, then `Uri.joinPath` + `workspace.fs.writeFile` (and the same pattern for `globalStorageUri`) ([Remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions#_persisting-extension-data-or-state)).

**Roster fit:** Use `globalStorageUri` + a JSON file if the roster is large or you want a file on disk. Use `storageUri` only when roster should be per-workspace — and handle empty-window (`storageUri === undefined`) by falling back to `globalState` / `globalStorageUri` or no-op.

## Prefer storage URIs over hard-coded `~/.vscode` paths

Primary remote doc ([Persisting extension data or state](https://code.visualstudio.com/api/advanced-topics/remote-extensions#_persisting-extension-data-or-state)):

> If your extension relies on current VS Code pathing conventions (for example `~/.vscode`) or the presence of certain OS folders (for example `~/.config/Code` on Linux) to persist data, you may run into problems.

It calls `globalStorageUri` / `storageUri` “safe” URIs for file-shaped state, and Memento for simple pairs. **Do not** invent paths under the user’s VS Code config tree for a future extension roster.

## Desktop / remote Node extension host vs web extension

### Node extension hosts (local + remote)

- Local and remote extension hosts run extensions in a **Node.js** runtime; entry via `package.json` `"main"` ([Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)).
- On desktop Node, `require('fs')` etc. exist in principle (remote docs discuss native modules and falling back to Node `fs` for Electron-specific modules — [Using native Node.js modules](https://code.visualstudio.com/api/advanced-topics/remote-extensions#_using-native-nodejs-modules), [Avoid using Electron modules](https://code.visualstudio.com/api/advanced-topics/remote-extensions#_avoid-using-electron-modules)).
- That does **not** make hard-coded local paths remote-correct. Official persistence path is still Memento / storage URIs / `workspace.fs`.

### Web extension host

([Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)):

- Web extensions have the **full VS Code API**, but **not** Node.js APIs / module loading; browser sandbox.
- Entry via `"browser"` (not `"main"`).
- Workspace and **`ExtensionContext.storageUri` / `globalStorageUri`** are on a **virtual** file system — access **must** go through `vscode.workspace.fs`.
- Migration guidance: replace Node `fs` usage with `workspace.fs`; avoid `path` / `URI.file` / `uri.fsPath` assumptions for virtual workspaces.
- **No child processes / running executables** in the web host (relevant if a future extension also spawns `gemini --acp` locally — that is a separate capability gap from persistence).

VS Code for the Web (`vscode.dev` / `github.dev`) only has the web extension host unless Codespaces adds a remote Node host ([Extension Host configurations](https://code.visualstudio.com/api/advanced-topics/extension-host)).

**Practical implication:** Implement roster I/O against Memento and/or `workspace.fs` + storage URIs once; that works on desktop Node, remote Node, and web. Relying on Node `fs` alone is desktop/remote-Node-only and wrong for web.

## Design note: who owns the roster?

| Ownership | Implication for VS Code |
| --- | --- |
| **Shared ACP proxy** persists roster (across proxy restarts) | Extension mostly talks to the proxy; host-side VS Code storage is optional (UI cache, not source of truth). |
| **Host owns roster** | VS Code **can** persist via `globalState` and/or `globalStorageUri` + `workspace.fs`, comparable to desktop app-owned files, as long as the extension uses these APIs (and does not assume Node `fs` if web support matters). |

Desktop (`apps/desktop`) can write app-managed files freely; VS Code’s equivalent first-class surface is `ExtensionContext` storage, not arbitrary OS paths under `~/.vscode`.

## Sources (primary)

- [VS Code API — ExtensionContext](https://code.visualstudio.com/api/references/vscode-api#ExtensionContext)
- [VS Code API — Memento](https://code.visualstudio.com/api/references/vscode-api#Memento)
- [VS Code API — workspace.fs / FileSystem](https://code.visualstudio.com/api/references/vscode-api#FileSystem)
- [Common Capabilities — Data Storage](https://code.visualstudio.com/api/extension-capabilities/common-capabilities)
- [Remote extensions — Persisting extension data or state](https://code.visualstudio.com/api/advanced-topics/remote-extensions#_persisting-extension-data-or-state)
- [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)

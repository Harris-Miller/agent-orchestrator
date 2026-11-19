# @lib/ui

Shared webview harness stack (Backend Harness Effects, Bootstrap phase and Harness application state, session bootstrap) for Harness Orchestrating Agents hosts (`apps/desktop`, `apps/vscode`). Hosts compose Live Host Layers; this package does not import Tauri or `*Live` adapters.

## Reading app state from MCP tools

Open the Developer panel (Developer mode on), go to the **Atoms** tab and click **Enable Atom inspector**. That installs the **Dev state bridge** as `window.__HOA__` (until the next reload), so Tauri MCP (`webview_execute_js`) and Chrome DevTools MCP (`evaluate_script`) can read Atoms without digging through React:

```js
window.__HOA__.atoms.list(); // [{ label, kind, computed, internal, keepAlive }, ...]
window.__HOA__.atoms.get('projects'); // JSON-safe value (Map/Set/Option/AsyncResult are tagged: { $type: 'Map', ... })
window.__HOA__.atoms.values(); // { label: value } for every computed Atom
```

These cover the Atoms currently in the registry: one nobody has read yet is missing, and a non-`keepAlive` Atom disappears once nothing observes it. Atoms are addressed by `Atom.withLabel`, else by the module export that holds them, else `anonymous#n` (not stable across reloads; label the Atom if tools need it). Those unnamed Atoms are internal plumbing (the Atoms behind `AtomFn`s and the host runtime): `list()` and `values()` omit them unless you pass `{ includeInternal: true }`, and the Atoms tab hides them behind **Show internal Atoms**; `get('anonymous#n')` still works. Per-key family Atoms are labeled `name:key`.

The same data then shows in the Atoms tab.

## Scripts

```sh
pnpm --filter=@lib/ui test
pnpm --filter=@lib/ui typecheck
pnpm --filter=@lib/ui lint
```

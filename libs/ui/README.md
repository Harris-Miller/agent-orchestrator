# @lib/ui

Shared webview harness stack (Backend Harness Effects, Bootstrap phase and Harness application state, session bootstrap) for Harness Orchestrating Agents hosts (`apps/desktop`, `apps/vscode`). Hosts compose Live Host Layers; this package does not import Tauri or `*Live` adapters.

## Reading app state from MCP tools

Dev builds (`tauri dev`, `vite`, `pnpm vscode:dev`) expose the **Dev state bridge** as `window.__HOA__`, so Tauri MCP (`webview_execute_js`) and Chrome DevTools MCP (`evaluate_script`) can read Atoms without digging through React:

```js
window.__HOA__.atoms.list(); // [{ label, kind, computed, keepAlive }, ...]
window.__HOA__.atoms.get('trackedCwds'); // JSON-safe value (Map/Set/Option/AsyncResult are tagged: { $type: 'Map', ... })
window.__HOA__.atoms.dump(); // { label: value } for every computed Atom
window.__HOA__.registry; // the raw Atom registry
```

The same data shows in the Developer panel's **Atoms** tab (Developer mode on).

## Scripts

```sh
pnpm --filter=@lib/ui test
pnpm --filter=@lib/ui typecheck
pnpm --filter=@lib/ui lint
```

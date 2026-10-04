# ACP Terminal Authentication UI: `@xterm/xterm`, Effect `Terminal`, and host alternatives

Date: 2026-10-04  
Question: How can `@xterm/xterm` and Effect’s `Terminal` be used to implement **ACP Terminal Authentication** UI (interactive login TTY for an Agent process), and what viable alternatives exist if those are not a good fit?

Scope: multi-surface Client (`apps/vscode` + `apps/desktop` / Tauri). Protocol v1 terminal auth only. Not an implementation plan for ACP session `terminal/*` methods (Agent-driven command terminals) — those are a related but separate capability.

## Recommendations summary (ponytail)

1. **Do not use Effect `Terminal` for this.** It is a CLI stdin/stdout service for Effect programs (`readLine` / `display` / dimensions), not a subprocess PTY or embedded emulator. Wrong layer for React/Tauri/VS Code login UI.
2. **VS Code MVP:** `vscode.window.createTerminal({ shellPath, shellArgs, cwd, env })` with the **same configured Agent program**, append method `args`, apply method `env`, `show()`, wait on `onDidCloseTerminal` + `exitStatus.code === 0`. VS Code owns the real PTY. No xterm dependency in the extension.
3. **Desktop MVP (in-app):** `@xterm/xterm` is only the **renderer**. Still need a **host PTY** (Rust `portable-pty` / community `tauri-plugin-pty`, or equivalent). Existing `@tauri-apps/plugin-shell` + Effect `ChildProcessSpawner` is **pipes, not a PTY** — fine for ACP JSON-RPC and non-TTY probes, weak for interactive login TUIs.
4. **Desktop lazy MVP (out-of-app):** open the OS terminal with the same command line — easy to show, **hard to wait for exit status 0** via Tauri opener. Spec success signal is exit status; prefer in-app PTY or a host-side spawn that reports exit.
5. **Combined xterm + Effect:** use Effect `ChildProcess` / lifecycle / reconnect orchestration; use xterm only for UI bytes. Do **not** route login IO through Effect `Terminal`.
6. **Capability gate:** advertise `clientCapabilities.auth.terminal: true` only when that surface can actually launch an interactive Agent TTY. Today `backendHarness` does not advertise it.

---

## 0. Protocol requirements (primary)

Sources:

- [Terminal Authentication RFD](https://agentclientprotocol.com/rfds/auth-methods.md)
- [Authentication (v1)](https://agentclientprotocol.com/protocol/v1/authentication.md)

### Flow

1. Client advertises `clientCapabilities.auth.terminal: true` during `initialize` (only if it can reproduce the configured Agent invocation in an interactive terminal).
2. Agent may then advertise an `authMethods` entry with `type: "terminal"`, optional `args` (default `[]`), optional `env` (v1 object map; values override same-named base launch env).
3. On user selection, Client launches a **separate** interactive process using the **same configured Agent program and base launch configuration**, plus descriptor `args` / `env`.
4. Client presents a TTY, waits for process exit: **0 = success**; non-zero, missing exit status, or cancellation = failure.
5. On success, Client **reconnects and reinitializes** ACP, then retries the gated operation.
6. Client **MUST NOT** call v1 `authenticate` with a terminal method ID. The login process is not the ACP connection.

The descriptor **cannot** specify a command — only args/env — so Clients stay in control of install paths.

### Not the same as ACP session terminals

`clientCapabilities.terminal` + Agent RPCs `terminal/create` / `terminal/output` / … are a **different** feature: Agent-driven command execution in the Client environment ([Terminals (v1)](https://agentclientprotocol.com/protocol/v1/terminals.md)). Session terminals may later share PTY/UI plumbing with auth, but auth is an out-of-band login launch, not `terminal/create`.

### Repo today

- `libs/effect-acp` models `AuthMethod` as opaque `Schema.Unknown` (`libs/effect-acp/src/schema/common.ts`); no typed `type: "terminal"` decoder yet.
- Desktop/VS Code harness initialize does **not** set `clientCapabilities.auth.terminal` (`libs/ui/src/host/backendHarness.ts`).
- No `@xterm/*` / `node-pty` / Effect `Terminal` usage in app `package.json` graphs for UI (confirmed empty for those names in workspace package manifests at research time).
- Process spawn already exists: Effect `ChildProcess` + host Lives (Tauri shell plugin; VS Code host child_process). Auth **probes** today are non-interactive (`libs/ui/src/host/vendorCliAuth.ts` — `codex login status`, `claude auth status`).

---

## 1. `@xterm/xterm` (+ addons)

Sources:

- [npm `@xterm/xterm`](https://www.npmjs.com/package/@xterm/xterm) (README: what it is / is not)
- [xterm.js `Terminal` API](https://xtermjs.org/docs/api/terminal/classes/terminal/)
- [Using addons](https://xtermjs.org/docs/guides/using-addons/)
- [npm `@xterm/addon-fit`](https://www.npmjs.com/package/@xterm/addon-fit)
- [npm `@xterm/addon-attach`](https://www.npmjs.com/package/@xterm/addon-attach)
- [npm `@xterm/addon-web-links`](https://www.npmjs.com/package/@xterm/addon-web-links) (listed on `@xterm/xterm` README addon table)

### What it is

Front-end **terminal emulator / renderer** in TypeScript for the browser (also used inside Electron/VS Code). Package import:

```ts
import { Terminal } from '@xterm/xterm';
```

Core job: parse VT sequences, render glyphs, capture keyboard/paste, expose buffer APIs.

### What it is not

From the official README:

- Not a downloadable terminal application.
- Not `bash` (or any shell).
- Does **not** spawn processes or allocate a PTY by itself.

### How you attach a PTY (wiring, not built-in)

Canonical byte bridge (documented via `onData` / `write` semantics on the API page):

| Direction | API | Meaning |
| --- | --- | --- |
| User → process | `term.onData(data => …)` | “In a typical setup, this should be passed on to the backing pty.” |
| Process → UI | `term.write(data)` / `writeln` | Feed PTY output (string or `Uint8Array` UTF-8) into the emulator |
| Binary mouse reports etc. | `term.onBinary` | Pass to PTY as binary (`Buffer.from(data, 'binary')` in docs example) |
| Resize | `term.onResize` + `term.resize` | Debounce; also resize the backing PTY |

Host still must provide:

1. **PTY allocation + process spawn** (OS pty / ConPTY).
2. **IPC** from WebView/UI to that host (Tauri commands/events, VS Code extension host, websocket, etc.).
3. **Exit status** observation for ACP success (xterm has no process lifecycle).

`@xterm/addon-attach` attaches the terminal to a **WebSocket**, not to a local PTY directly ([npm `@xterm/addon-attach`](https://www.npmjs.com/package/@xterm/addon-attach)). Useful only if you already run a websocket↔pty bridge.

Typical UI addons:

- `@xterm/addon-fit` — `FitAddon.fit()` to container size ([npm](https://www.npmjs.com/package/@xterm/addon-fit)).
- `@xterm/addon-web-links` — link detection ([listed on `@xterm/xterm` README](https://www.npmjs.com/package/@xterm/xterm)).
- `@xterm/addon-webgl` — GPU renderer (optional; WebView/GPU caveats apply).

### WebView / desktop constraints

Tauri UI runs in a system WebView. The frontend cannot load Node native addons like `node-pty`. PTY must live in the **Rust host** (or a native sidecar), with bytes bridged to the WebView where xterm runs. Browser APIs alone cannot create a POSIX/Windows pseudo-terminal.

---

## 2. Effect `Terminal` (installed in this repo)

Installed Effect version observed under pnpm: `effect@4.0.0-rc.112`.

### Real module names

| Piece | Module / package | Role |
| --- | --- | --- |
| Service definition | `effect/Terminal` (`node_modules/effect/src/Terminal.ts`) | Context service: `columns`, `rows`, `readInput`, `readLine`, `display` |
| Node Live | `@effect/platform-node` → `NodeTerminal` (`export * as NodeTerminal from "./NodeTerminal.ts"`) | Adapts **this process** `stdin`/`stdout` + `readline` |
| Shared impl | `@effect/platform-node-shared` `NodeTerminal.ts` | Implements TTY raw mode, keypress queue, readline line reading |

`@effect/platform-node` is a dependency of `libs/effect-acp` (catalog); not required by the desktop React app for UI.

### What it provides

From `effect/src/Terminal.ts` module docs and interface:

> “A `Terminal` represents a command-line interface which can read input from a user and display messages to a user.”

APIs:

- `columns` / `rows` — Effect-wrapped dimension queries
- `readInput` — `Queue` of `UserInput` (optional char + key modifiers)
- `readLine` — one line, or `QuitError` (Ctrl+C style cancel)
- `display(text)` — write to default stdout

`NodeTerminal` docs state it adapts Node `readline` plus current process `stdin`/`stdout`, enables TTY raw mode while in scope, ends key input on Ctrl+C / Ctrl+D by default (`node_modules/.pnpm/@effect+platform-node-shared@…/src/NodeTerminal.ts`).

### What it does **not** provide

- No embedded terminal emulator for React/DOM.
- No API to spawn a child with a PTY.
- No bridge to xterm.
- Not suitable inside Tauri WebView (no Node `process.stdin` TTY for the UI process in that model).

### Fit for interactive Agent login subprocess

**Poor.** Effect `Terminal` is for building Effect **CLI apps** that are themselves the interactive program. ACP terminal auth needs the Client to **host** someone else’s interactive program and observe its exit code. That is process+PTY+UI work, not `Terminal.readLine`.

Related Effect APIs that *do* matter for ACP generally:

- `effect/unstable/process` — `ChildProcess.make` / `ChildProcessSpawner` (pipes, cwd/env/shell options; no PTY flag in `CommandOptions` — see `ChildProcess.ts` `CommandOptions`).
- This repo’s Lives: `libs/context-services-tauri/src/ChildProcessSpawnerLive.ts` → `@tauri-apps/plugin-shell` `Command.create` / `spawn` / stdin write / close code.

---

## 3. Combined use: xterm + Effect

| Concern | Prefer |
| --- | --- |
| Render VT / keyboard in desktop WebView | `@xterm/xterm` (+ fit / web-links as needed) |
| Allocate PTY + spawn Agent program | Host native (Rust pty plugin / custom commands), **not** Effect `Terminal` |
| Orchestrate “launch → wait exit → reconnect ACP” | Effect workflows already used for harness (`ChildProcessSpawner`, layers, scoped fibers) |
| Pipe-based ACP stdio transport | Existing Effect `ChildProcess` Lives (unchanged) |

**When combination makes sense:** desktop in-app auth panel = xterm UI + host PTY + Effect-managed reconnect state machine.

**When it does not:** VS Code surface (use integrated terminal API); pure CLI Effect tools (use Effect `Terminal` alone, no xterm); expecting Effect `Terminal` to drive xterm (no such adapter exists in Effect).

---

## 4. VS Code path (primary Extension API)

Source: [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api) (`window.createTerminal`, `TerminalOptions`, `Terminal.exitStatus`, `Pseudoterminal`).

### Preferred MVP: real shell terminal

```ts
const terminal = vscode.window.createTerminal({
  name: 'Agent login',
  shellPath: configuredAgentProgram, // same program as ACP launch
  shellArgs: [...baseArgs, ...methodArgs],
  cwd: baseCwd,
  env: { ...overridesFromMethodEnv },
  // strictEnv?: true only if you must replace env entirely
});
terminal.show();
```

Wait for completion:

```ts
const code = await new Promise<number | undefined>((resolve, reject) => {
  const sub = vscode.window.onDidCloseTerminal(t => {
    if (t !== terminal) return;
    sub.dispose();
    resolve(t.exitStatus?.code);
  });
});
const success = code === 0;
```

`TerminalExitStatus` semantics ([API](https://code.visualstudio.com/api/references/vscode-api)):

- `code === 0` — success
- non-zero — failure
- `undefined` — user forcibly closed terminal or no code provided → treat as failure per ACP (“termination without an exit status, or cancellation”)

`TerminalOptions` also documents `cwd`, `env`, `strictEnv`, `hideFromUser`, location, etc.

This maps cleanly onto ACP: Client launches configured program + args/env, presents TTY (VS Code panel), waits for exit, reconnects. Extension does **not** need xterm (VS Code’s integrated terminal already embeds xterm.js upstream).

### Extension Terminal / `Pseudoterminal`

`createTerminal({ name, pty: Pseudoterminal })` lets the extension own IO (`onDidWrite`, `handleInput`, `onDidClose` with optional exit code). Useful if you spawn via `node-pty` / child_process yourself and mirror bytes into VS Code’s UI. **Heavier than needed** for auth MVP when `shellPath`/`shellArgs` already run the Agent program under a real PTY.

Historical note: Extension Terminals replaced TerminalRenderer ([VS Code 1.37 release notes](https://code.visualstudio.com/updates/v1_37)).

### Repo note

`apps/vscode` currently has **no** `createTerminal` usage (grep empty). Host process tracking exists for webview-spawned children (`apps/vscode/src/host/processTracker.ts`) but that is pipe-oriented ACP plumbing, not integrated-terminal auth.

---

## 5. Desktop / Tauri alternatives

### What this repo already uses

| Layer | Source | Behavior |
| --- | --- | --- |
| Effect command | `effect/unstable/process` `ChildProcess.make` | cwd/env/extendEnv/shell; stdio pipe/inherit/ignore |
| Tauri Live | `libs/context-services-tauri/src/ChildProcessSpawnerLive.ts` | `@tauri-apps/plugin-shell` `Command.create` + `spawn`, `encoding: 'raw'`, stdin `Child.write`, exit via `close` payload |
| Capabilities | `apps/desktop/src-tauri/capabilities/default.json` | Scoped allow-lists for `bun`/`claude`/`codex`/`gemini`/`node`/…; `shell:allow-stdin-write`, `opener:default` |

Official shell plugin docs: spawn child processes with stdout/stderr events and stdin write — **no PTY / winsize / TTY flags** in [`SpawnOptions`](https://v2.tauri.app/reference/javascript/shell/) (`cwd`, `env`, `encoding` only).

Implication: interactive login programs that check `isatty`, use raw mode, alternate screens, or password readers may misbehave or block on piped stdio. ACP JSON-RPC Agents already run over pipes today; **auth login is a different quality bar**.

### Alternative A — In-app: xterm + host PTY (recommended desktop shape)

1. Rust host opens a PTY and spawns configured Agent + args/env (e.g. `portable-pty`, as used by community [Tnze/tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty) — README shows xterm `onData`/`write` ↔ `tauri-pty` `spawn`; status: “Developing!”).
2. Bridge bytes + resize + exit code to WebView.
3. Render with `@xterm/xterm` + `@xterm/addon-fit`.
4. On exit 0, tear down PTY session and run existing ACP reconnect/initialize path.

First-party Tauri does **not** ship a PTY plugin; shell + opener are the official process/open surfaces ([Shell](https://v2.tauri.app/plugin/shell/), [Opener](https://v2.tauri.app/plugin/opener/)).

### Alternative B — `node-pty` + xterm

[`node-pty`](https://github.com/microsoft/node-pty) is the usual Node PTY binder; README explicitly pairs with xterm.js. Fits **Electron/Node extension host**, not Tauri WebView JS. Could work in a Node sidecar, but this desktop app’s spawn path is Tauri/Rust — adding Node-native pty is a heavier runtime dependency than Rust `portable-pty`.

### Alternative C — Open system terminal

`@tauri-apps/plugin-opener` opens paths/URLs in default apps ([Opener docs](https://v2.tauri.app/plugin/opener/)) — not a “run this argv and wait for exit code” API. Shelling out to `open -a Terminal` / `osascript` / `wt.exe` can show a TTY, but **observing exit status 0** for ACP is unreliable without a wrapper process the app still owns. Spec allows no in-band success string — exit status is the interoperability signal.

### Alternative D — Pipe-only “terminal” with xterm

Feed `plugin-shell` stdout/stderr into xterm and stdin from `onData`. Lowest effort reuse of current Lives; **may fail** real login TUIs. Acceptable only as a degraded experiment, not as the capability you advertise unless tested against each Agent’s login UX.

---

## 6. Practical MVP shapes (vscode vs desktop)

### Shared orchestration (both apps)

1. Parse `authMethods` entries with `type === "terminal"`.
2. Build argv = configured Agent program + base args + method `args`.
3. Build env = base launch env, overridden by method `env`.
4. Launch interactive session; wait for exit.
5. Success (`code === 0`) → dispose/kill ACP connection → spawn/initialize again → retry.
6. Never call `authenticate` with that method id.
7. Advertise `clientCapabilities.auth.terminal: true` **per surface** only when step 4 is implemented there.

### `apps/vscode` MVP (smallest)

- Use `createTerminal(TerminalOptions)` with `shellPath` / `shellArgs` / `cwd` / `env`.
- Await `onDidCloseTerminal` + `exitStatus`.
- No `@xterm/*`, no Effect `Terminal`, no `Pseudoterminal` unless you later need custom process control.
- Reuse existing host knowledge of configured Agent command (same as ACP spawn).

### `apps/desktop` MVP

**Phase 1 (honest capability):** either implement PTY+xterm, or **omit** `auth.terminal` capability and keep pointing users at external CLI login (current `vendorCliAuth` messaging pattern).

**Phase 2 (in-app):** xterm panel + Rust PTY plugin/commands + exit deferred; Effect only for reconnect state. Keep using `ChildProcessSpawner` for the ACP session process (pipes).

**Avoid for auth:** Effect `Terminal`; advertising capability while only opening Terminal.app without exit tracking.

### Split summary

| Surface | UI | Process/TTY | Effect role |
| --- | --- | --- | --- |
| VS Code | Integrated terminal | VS Code PTY via `createTerminal` | Optional: reconnect/initialize Effects after exit |
| Desktop | `@xterm/xterm` in WebView | Host PTY (new); not `plugin-shell` alone | Lifecycle + ACP reconnect; not `effect/Terminal` |

---

## 7. Open questions / unknowns

1. **Per-Agent login TTY needs:** Which Agents will advertise `type: "terminal"`, and do their login flows require a true TTY (raw mode / alternate screen) vs simple line prompts? Primary sources define Client duties but not Agent UX matrices.
2. **First-party Tauri PTY:** No official Tauri PTY plugin found in v2 docs; community `tauri-plugin-pty` is explicitly “Developing!” — production readiness, permissions model, and Windows ConPTY behavior need evaluation beyond README.
3. **`strictEnv` / env merge on VS Code:** Method `env` overrides same-named base vars (ACP). Whether to set `TerminalOptions.strictEnv` depends on how completely the extension can reconstruct the Agent’s base environment; not specified by ACP.
4. **Remote / Codespaces / SSH remotes:** ACP says Clients connected over remote transports must omit `auth.terminal` unless they can launch the Agent in the Agent’s execution environment. VS Code remote semantics for `createTerminal` in those hosts were not fully audited here.
5. **Shared PTY stack with session `terminal/*`:** Whether desktop should invest in one PTY service for both auth and Agent `terminal/create` is an architecture choice; protocol treats them separately.
6. **Schema typing:** Promoting `AuthMethod` from `Schema.Unknown` to a discriminated union including `terminal` is product work not covered by package docs.

---

## Citations index

| Claim area | Source |
| --- | --- |
| Terminal auth flow, capability, must not `authenticate` | https://agentclientprotocol.com/rfds/auth-methods.md ; https://agentclientprotocol.com/protocol/v1/authentication.md |
| Session `terminal/*` (distinct) | https://agentclientprotocol.com/protocol/v1/terminals.md |
| xterm is renderer not process | https://www.npmjs.com/package/@xterm/xterm |
| xterm `onData` / `write` / PTY wording | https://xtermjs.org/docs/api/terminal/classes/terminal/ |
| Addons fit / attach / web-links | https://xtermjs.org/docs/guides/using-addons/ ; npm `@xterm/addon-*` pages |
| Effect `Terminal` service | `node_modules/effect/src/Terminal.ts` |
| Node `Terminal` Live | `@effect/platform-node` `NodeTerminal`; impl in `@effect/platform-node-shared` `NodeTerminal.ts` |
| Effect child process options (no PTY) | `node_modules/effect/src/unstable/process/ChildProcess.ts` (`CommandOptions`) |
| Tauri shell spawn (no PTY) | https://v2.tauri.app/plugin/shell/ ; https://v2.tauri.app/reference/javascript/shell/ |
| Repo Tauri spawner | `libs/context-services-tauri/src/ChildProcessSpawnerLive.ts` |
| VS Code `createTerminal` / exitStatus | https://code.visualstudio.com/api/references/vscode-api |
| node-pty + xterm pairing | https://github.com/microsoft/node-pty (README) |
| Community Tauri PTY + xterm example | https://github.com/Tnze/tauri-plugin-pty |
| Opener (open path/url, not wait-exit) | https://v2.tauri.app/plugin/opener/ |

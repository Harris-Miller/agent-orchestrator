# desktop

Tauri + React desktop application that hosts the **Agent Harness** — an ACP Client for driving external coding agents (Codex, Claude, Gemini) without embedding vendor LLM SDKs.

## Application

**Agent Harness**:
The desktop app's core responsibility: spawn ACP Agent subprocesses, negotiate capabilities, run sessions, and fulfill Client-side ACP requests (filesystem, terminal, permissions) on behalf of the user.
_Avoid_: Orchestrator (repo-wide product name — use in cross-package docs), client app, IDE

**Harness UI**:
The React surface that presents sessions, agent output, and permission prompts to the user. Consumes Harness domain state; does not speak ACP or spawn processes directly.
_Avoid_: Frontend, view layer, shell

**Chat item**:
A single ordered unit in the Harness UI transcript — a user message, agent message, tool call, plan, usage readout, etc. Derived from session updates (and locally appended user prompts), not sent on the wire.
_Avoid_: Message, bubble, row, event

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: `connecting` → `initialized` → `session_open` → `ready`, or `error`. Describes Client-side setup only — not an ACP Session or Turn.
_Avoid_: Status, connection state

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs `initialize` and `session/new`, accumulates chat items from session updates, and retries on failure. One per mounted target; runs in parallel with siblings.
_Avoid_: Connection, provider instance, worker

## Agent backends

**Agent provider**:
A supported external coding-agent backend the Harness can connect to: **Codex**, **Claude**, or **Gemini**. Each provider is reached as an ACP Agent subprocess, not via an in-process LLM SDK.
_Avoid_: Model, LLM, vendor, integration

**Agent launch target**:
The spawn identity for a selectable harness connection — an ACP adapter binary (`codex-acp`, `claude-agent-acp`), a native ACP agent CLI, or the jsonrpc-echo dev fixture. Distinct from the agent provider name (Codex, Claude, Gemini).
_Avoid_: Backend (ambiguous with Tauri host), provider id

**Harness dev backend**:
The jsonrpc-echo fixture selectable in the prototype agent picker for local development. Exercises the same bootstrap path as real providers but is not an agent provider.
_Avoid_: Echo backend, mock agent, test provider

**ACP adapter**:
A published stdio process that wraps a vendor CLI or SDK and speaks ACP on stdin/stdout. Used for Codex ([`codex-acp`](https://github.com/agentclientprotocol/codex-acp)) and Claude ([`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)).
_Avoid_: Bridge, wrapper, proxy, shim

**Native ACP agent**:
A vendor CLI that implements ACP directly — no separate adapter package. Gemini is the initial native provider (ACP built into the Gemini CLI).
_Avoid_: Built-in agent, direct agent, first-party server

**Provider launch**:
How the Harness starts a provider subprocess: executable, arguments, working directory, and environment. Differs per provider (adapter binary vs native CLI) but always yields a stdio ACP Agent the Harness connects to via `@libs/effect-acp`.
_Avoid_: Spawn config, agent command, connection string

## Desktop host

**WebView runtime**:
The JavaScript execution environment for all code under `apps/desktop/src` — the Tauri WebView (Vite-bundled), not Node.js or Bun.
_Avoid_: Frontend runtime, browser, Node, JS host

**Tauri host**:
The desktop runtime (Rust + WebView) that runs the Harness UI and supplies OS capabilities to Effect code through Tauri plugins.
_Avoid_: Backend, native layer, shell

**Tauri services**:
Live Effect layers in `src/context-services/` that implement portable `@lib/context-services` and platform primitives (OS, Path, FileSystem, ChildProcessSpawner) on top of Tauri — analogous to `@effect/platform-node`'s `NodeServices.layer`.
_Avoid_: Platform layer, context-services (the portable package name), adapters

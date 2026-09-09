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
A single ordered unit in the Harness UI transcript — a user message, agent message, tool call, plan, etc. Derived from session updates (and locally appended user prompts), not sent on the wire. Not a pending interaction.
_Avoid_: Message, bubble, row, event

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: `connecting` → `initialized` → `ready`, or `error`. Describes Client-side setup only — not an ACP Session or Turn.
_Avoid_: Status, connection state

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs `initialize` and `session/list`, accumulates chat items from session updates, and retries on failure. One per mounted target; runs in parallel with siblings.
_Avoid_: Connection, provider instance, worker

## Sessions

**Session cwd**:
The absolute directory that is a session's primary filesystem context (ACP `cwd`). Chosen by the user when creating a session; carried on the roster entry; required on `session/new`, `session/load`, and `session/resume`. Distinct from the Tauri host process cwd.
_Avoid_: Host cwd, working folder, project root (when you mean the ACP session parameter)

**Session roster**:
Cached `session/list` results across mounted backend harnesses; shown in the Harness UI grouped by session cwd (each row carries its agent launch target). Can be refreshed with another `session/list` without restarting the backend harnesses.
_Avoid_: Session list, session catalog, session drawer

**Roster entry**:
One row in the session roster: agent-reported identity and metadata (`sessionId`, session cwd, optional `title`) plus which agent launch target owns it. May exist without a session snapshot until the user creates or activates it.
_Avoid_: Session (when you mean the full working copy)

**Session snapshot**:
The Harness working copy for one session: transcript, status, session configuration, usage, and pending client request state. One per `sessionId` per backend harness.
_Avoid_: Session record, session object

**Session status**:
Harness-reported lifecycle for a session snapshot: `activating` (load or resume in flight), `active` (loaded on the agent; prompts allowed), or `inactive` (not loaded, or closed via Deactivate). Not an ACP protocol concept.
_Avoid_: Session state (ambiguous with session configuration)

**Config option**:
An agent-reported selectable setting on a session — model, mode, and other provider-specific choices. Populated from session activation responses and update notifications.
_Avoid_: Setting, preference, parameter

**Session configuration**:
Normalized config options from a `session/new`, `session/load`, or `session/resume` response. Cached on the session snapshot; drives model and mode selection in the Harness UI.
_Avoid_: Session state, session/new result

**Provider config catalog**:
Agent-reported selectable config options (ids, labels, choices) for one agent launch target, shared across that target's sessions. Not tied to a session snapshot.
_Avoid_: Session configuration, agent defaults

**Harness config defaults**:
User-preferred values per config option id for one agent launch target.
_Avoid_: Agent defaults, session configuration, currentValue

**Usage**:
Agent-reported context-window fill and cumulative session cost on a session snapshot. Not a chat item.
_Avoid_: Usage readout, token usage, telemetry, context meter

**Handoff**:
Harness action that asks the source active session for a tagged handoff document via `session/prompt`, then creates a new session on a chosen agent launch target (same session cwd), applies chosen config options, and seeds it with a `session/prompt` containing that document. Not an ACP protocol concept; not a durable Harness record (v1).
_Avoid_: Transfer, migrate session, export chat

**Pending client request**:
Harness flag on a session snapshot while a client→agent RPC is outstanding for that session (`session/prompt` or a config-option change). Blocks overlapping outbound RPCs until the response arrives. Harness UX policy — stricter than ACP minimum, which allows mode changes during generation. Distinct from a pending interaction (Agent→Client).
_Avoid_: In flight, loading, busy flag

**Pending elicitation**:
Outstanding Agent `elicitation/create` held on a session snapshot until the user accepts, declines, or cancels. Ephemeral snapshot state — not a chat item.
_Avoid_: Elicitation form, form card, open elicitation

**Pending permission**:
Outstanding Agent `session/request_permission` held on a session snapshot until the user selects an option. Ephemeral snapshot state — not a chat item.
_Avoid_: Permission card, approval prompt, open permission

**Pending interaction**:
A pending elicitation or pending permission on a session snapshot. The Harness UI blocks sending another prompt while one is present.
_Avoid_: Pending client request, blocking dialog, modal

**Selected session**:
App-wide UI focus by `sessionId`; determines which transcript the main chat shows, which session receives prompts, and what the session-state panel displays. Not per-agent — switching focus is choosing a session, not an agent.
_Avoid_: Current session, focused session

**Active session**:
A session loaded on the ACP Agent (`session/new`, `session/load`, or `session/resume` completed; ends at `session/close`). Multiple may be active per agent simultaneously; only the selected session accepts prompts.
_Avoid_: Open session, live session

## Agent backends

**Agent provider**:
A supported external coding-agent backend the Harness can connect to: **Codex**, **Claude**, or **Gemini**. Each provider is reached as an ACP Agent subprocess, not via an in-process LLM SDK.
_Avoid_: Model, LLM, vendor, integration

**Agent launch target**:
The spawn identity for a selectable harness connection — an ACP adapter from the adapter resource tree (`codex-acp`, `claude-agent-acp`), or a native ACP agent CLI. Distinct from the agent provider name (Codex, Claude, Gemini).
_Avoid_: Backend (ambiguous with Tauri host), provider id

**ACP adapter**:
A published stdio process that wraps a vendor CLI or SDK and speaks ACP on stdin/stdout. Used for Codex ([`codex-acp`](https://github.com/agentclientprotocol/codex-acp)) and Claude ([`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)).
_Avoid_: Bridge, wrapper, proxy, shim

**Adapter resource tree**:
Isolated ACP adapter install under `apps/desktop/acp-adapter-resources` (own lockfile, hoisted `node_modules`) copied into the Tauri application package for provider launch. Shared by `tauri:dev` and packaged builds.
_Avoid_: node_modules, Vite assets, sidecar, bundled adapters (ambiguous with Vite)

**Vendor CLI**:
User-installed agent CLI on PATH (`codex`, `claude`, `gemini`) that an ACP adapter or native ACP agent requires. The Harness detects it and does not install it.
_Avoid_: Agent binary, provider CLI, global install

**Native ACP agent**:
A vendor CLI that implements ACP directly — no separate adapter package. Gemini is the initial native provider (ACP built into the Gemini CLI).
_Avoid_: Built-in agent, direct agent, first-party server

**Provider launch**:
How the Harness starts a provider subprocess: executable, arguments, working directory, and environment. Differs per provider (adapter from the adapter resource tree vs native CLI) but always yields a stdio ACP Agent the Harness connects to via `@libs/effect-acp`.
_Avoid_: Spawn config, agent command, connection string

## Desktop host

**Bundle**:
The Tauri application package produced by `tauri build` (resources, binaries, installers). Distinct from the WebView Vite build.
_Avoid_: Vite bundle, frontend build, webpack bundle

**WebView runtime**:
The JavaScript execution environment for all code under `apps/desktop/src` — the Tauri WebView (Vite-bundled), not Node.js or Bun.
_Avoid_: Frontend runtime, browser, Node, JS host

**Tauri host**:
The desktop runtime (Rust + WebView) that runs the Harness UI and supplies OS capabilities to Effect code through Tauri plugins.
_Avoid_: Backend, native layer, shell

**Host cwd**:
The Tauri host process current working directory from the OS service. Used for provider launch and fixture resolution — not a session's project context.
_Avoid_: Session cwd

**Tauri services**:
Live Effect layers in `src/context-services/` that implement portable `@lib/context-services` and platform primitives (OS, Path, FileSystem, ChildProcessSpawner) on top of Tauri — analogous to `@effect/platform-node`'s `NodeServices.layer`.
_Avoid_: Platform layer, context-services (the portable package name), adapters

## Observability

**Action root**:
A Harness-initiated unit of work that owns one distributed trace — either a **user action** (composer send, session lifecycle, config change, handoff, restart) or a **system action** (bootstrap, roster refresh). Sibling action roots do not nest under each other. Responding to a pending interaction is not an action root when a turn is open — see **Turn-correlated work**.
_Avoid_: Request, span (when you mean the product unit), operation

**User action**:
An action root triggered from the Harness UI.
_Avoid_: Background job, job, task

**System action**:
An action root that keeps a backend harness or roster coherent without a direct UI gesture for that work (bootstrap, roster refresh).
_Avoid_: Background job, job, task

**Turn-correlated work**:
Agent→Client traffic that belongs to an open ACP **Turn** (see `@libs/effect-acp`): session updates, elicitation, permission requests, and the user’s respond to those. While a turn is in flight for a session, this work combines into that turn’s trace. When no turn is open, the same traffic (including an orphan respond) is its own short root — not attached to bootstrap or connection setup, and not promoted to a standing user-action term.
_Avoid_: RPC child, notification, demux event, action root (for respond-while-turn-open)

**Connection setup**:
The short setup slice of bringing a backend harness online (spawn, connect, initialize, first roster list). An action root of its own — not a parent for later turns or lifetime Agent→Client traffic.
_Avoid_: Connection span, live connection, session (when you mean setup)

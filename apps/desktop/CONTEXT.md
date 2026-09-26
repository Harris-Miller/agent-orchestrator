# desktop

Tauri + React desktop application that hosts the **Agent Harness** — an ACP Client for driving external coding agents (Codex and Claude mounted; Gemini planned via `gemini-acp`) without embedding vendor LLM SDKs.

## Application

**Agent Harness**:
The desktop app's core responsibility: spawn ACP Agent subprocesses, negotiate capabilities, run sessions, and fulfill Client-side ACP requests (filesystem, terminal, permissions) on behalf of the user.
_Avoid_: Orchestrator (product/repo name only today — never a Harness domain synonym; expect this word to be redefined when Orchestrator becomes a Harness feature), client app, IDE

**Harness UI**:
The React surface that presents sessions, agent output, and permission prompts to the user. Consumes Harness domain state; does not speak ACP or spawn processes directly.
_Avoid_: Frontend, view layer, shell

**Settings page**:
Full-page Harness UI route (`/settings`) for browsing preferences; reads and writes User settings through `@lib/ao-home`.
_Avoid_: Settings modal, settings dialog, config screen

**Theme preference**:
User-chosen Harness UI theme id stored in User settings.
_Avoid_: color mode, appearance mode, MUI theme (when meaning the preference)

**Session delete confirmation**:
Whether deleting a session shows the confirm dialog; stored in User settings; on when unset.
_Avoid_: delete confirm, confirm before delete, destructive confirm

**State Atom**:
Effect Atom that owns produce/update for one reactive piece of Harness UI state. User settings is a write-through state Atom over `@lib/ao-home`; its value is an `AsyncResult` so first load is visible without a separate hydrate flag.
_Avoid_: store, reducer, settings service

**Mount Atom**:
One-shot `Atom.fn` used elsewhere to seed or load on app mount. Not used for User settings after the write-through state Atom (contrast term).
_Avoid_: hydrate Atom, bootstrap Atom (when meaning a mount-only procedure)

**Chat item**:
A single ordered unit in a session transcript — a user message, agent message, tool call, plan, etc. Derived from session updates (and locally appended user prompts), not sent on the wire. Not a pending interaction.
_Avoid_: Message, bubble, row, event

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: `connecting` → `initialized` → `probing` → `ready`, or `error`. Describes Client-side setup only — not an ACP Session or Turn. `probing` runs the Config probe and buffers `session/list` until Ready.
_Avoid_: Status, connection state

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs `initialize`, Config probe, and buffered `session/list`, and retries on failure. One per mounted target; runs in parallel with siblings. Does not own the session transcript.
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
The Harness working copy for one session: session transcript, status, session configuration, usage, pending client request state, and session cwd when known (stamped on create, handoff, or activate). One per `sessionId` per backend harness. Roster remains the agent-reported list source for cwd when a snapshot has none yet.
_Avoid_: Session record, session object

**Session transcript**:
The ordered chat items for one session snapshot, derived from session updates and locally appended user prompts. Sole owner of that session’s chat items; survives backend harness reconnect.
_Avoid_: Chat log, message list, accumulator

**Session update apply**:
Pure Harness fold that turns one inbound ACP `session/update` into the next session snapshot (and roster title when needed). Owns transcript reduction, available commands, usage, and config-option merge. Does not persist usage — that stays at the atom seam.
_Avoid_: foldSessionUpdate, session update reducer (transcript-only), demux

**Session status**:
Harness-reported lifecycle for a session snapshot: `activating` (load or resume in flight), `active` (loaded on the agent; prompts allowed), or `inactive` (not loaded, or closed via Deactivate). Not an ACP protocol concept.
_Avoid_: Session state (ambiguous with session configuration)

**Config option**:
An agent-reported selectable setting on a session — model, mode, and other provider-specific choices. Populated from session activation responses and update notifications.
_Avoid_: Setting, preference, parameter

**Session configuration**:
Normalized config options from a `session/new`, `session/load`, or `session/resume` response. Cached on the session snapshot; drives model and mode selection in the Harness UI.
_Avoid_: Session state, session/new result

**Materialize**:
Harness step that turns a successful session activation RPC result (and any follow-on config-option applies) into a session snapshot and, when needed, a roster entry. Not the RPC itself (`session/new`, `session/load`, `session/resume`).
_Avoid_: Provision, hydrate, commit activation, apply session activation

**Config option index**:
Ephemeral State Atom per agent launch target: `defaultModelId` plus selectable Config options keyed by model id (with probe `currentValue`s). Filled by Config probe during Bootstrap; consumed by Handoff. Not Session configuration, User settings, or ao-home.
_Avoid_: Provider config catalog, harness defaults, session configuration

**Config probe**:
Connection-setup work during Bootstrap `probing`: disposable-cwd `session/new` → capture by model → sequential `set_config_option` per other model → publish Config option index → best-effort `session/close`. Not an Active session; never Materialize; never a Roster entry.
_Avoid_: Session create, materialize, activate

**Usage**:
Agent-reported context-window fill and cumulative session cost on a session snapshot. Not a chat item.
_Avoid_: Usage readout, token usage, telemetry, context meter

**Handoff**:
Harness action that asks the source active session for a tagged handoff document via `session/prompt`, then creates a new session on a chosen agent launch target (same session cwd), applies chosen config options, and seeds it with a `session/prompt` containing that document. Not an ACP protocol concept; not a durable Harness record (v1).
_Avoid_: Transfer, migrate session, export chat

**Pending client request**:
Harness flag on a session snapshot while a client→agent RPC is outstanding for that session, discriminated as a prompt turn or a config-option change. Blocks overlapping outbound RPCs until the response arrives. Prompt-kind pending enables Prompt turn cancel in the Harness UI; config-kind pending does not. Harness UX policy — stricter than ACP minimum, which allows mode changes during generation. Distinct from a pending interaction (Agent→Client).
_Avoid_: In flight, loading, busy flag

**Prompt turn cancel**:
Harness action that sends ACP `session/cancel` for an in-flight prompt turn on a session. The session stays active. Distinct from Deactivate (`session/close`), elicitation cancel, and `$/cancel_request`.
_Avoid_: Stop generation (vendor-specific), abort session, session close

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
An external coding-agent backend the Harness can connect to: **Codex** and **Claude** are mounted; **Gemini** is planned via the `gemini-acp` adapter. Each provider is reached as an ACP Agent subprocess, not via an in-process LLM SDK.
_Avoid_: Model, LLM, vendor, integration

**Agent launch target**:
The spawn identity for a selectable harness connection — an ACP adapter from the adapter resource tree (`codex-acp`, `claude-agent-acp`, and planned `gemini-acp`). Distinct from the agent provider name (Codex, Claude, Gemini).
_Avoid_: Backend (ambiguous with Tauri host), provider id

**ACP adapter**:
A stdio process the Harness spawns that speaks ACP on stdin/stdout. Wraps a vendor CLI or SDK that is not ACP-native (Codex via [`codex-acp`](https://github.com/agentclientprotocol/codex-acp), Claude via [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)), or sits in front of a native ACP agent to complete session lifecycle capabilities the vendor omits (planned `gemini-acp` in front of Gemini CLI).
_Avoid_: Bridge, wrapper, proxy, shim

**Adapter resource tree**:
Isolated ACP adapter install at repo-root `acp-adapter-resources/` (own lockfile, hoisted `node_modules`; shared with the VS Code extension) copied into the Tauri application package for provider launch. Shared by `tauri:dev` and packaged builds.
_Avoid_: node_modules, Vite assets, sidecar, bundled adapters (ambiguous with Vite)

**Vendor CLI**:
User-installed agent CLI on PATH (`codex`, `claude`, `gemini`) that an ACP adapter or native ACP agent requires. The Harness detects it and does not install it.
_Avoid_: Agent binary, provider CLI, global install

**Native ACP agent**:
A vendor CLI that implements ACP directly. The Harness may still reach it through an ACP adapter when the native agent omits required session lifecycle capabilities (Gemini CLI via planned `gemini-acp`).
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

**Host services**:
Portable aggregate of ChildProcessSpawner, FileSystem, OS, and Path — see [`libs/context-services/CONTEXT.md`](../../libs/context-services/CONTEXT.md). Injected into the ACP Atom runtime; desktop fulfills it with Tauri services.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

**Tauri services**:
Desktop Live Adapter of Host services in `@lib/context-services-tauri` (`TauriServicesLive`) — analogous to `@effect/platform-node`'s `NodeServices.layer`. Composed once into the ACP Atom runtime factory.
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

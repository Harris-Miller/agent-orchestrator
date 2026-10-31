# desktop

Tauri + React desktop application that hosts the **Agent Harness** — an ACP Client for driving external coding agents (Codex, Claude, and optionally Antigravity / Cursor when beta flags are on) without embedding vendor LLM SDKs.

## Application

**Agent Harness**:
The desktop app's core responsibility: spawn ACP Agent subprocesses, negotiate capabilities, run sessions, and fulfill Client-side ACP requests (filesystem, terminal, permissions) on behalf of the user.
_Avoid_: Orchestrator (product/repo name only today — never a Harness domain synonym; expect this word to be redefined when Orchestrator becomes a Harness feature), client app, IDE

**Harness UI**:
The React surface that presents sessions, agent output, and permission prompts to the user. Consumes Harness domain state; does not speak ACP or spawn processes directly.
_Avoid_: Frontend, view layer, shell

**Settings page**:
Full-page Harness UI route (`/settings/$category`, default entry `/settings/general`) for browsing preferences; reads and writes User settings through `@lib/ao-home`. Host shells differ (desktop category rail vs vscode list→detail) but share the same Settings panes from `@lib/ui`.
_Avoid_: Settings modal, settings dialog, config screen

**Theme preference**:
User-chosen Harness UI theme id stored in User settings.
_Avoid_: color mode, appearance mode, MUI theme (when meaning the preference)

**Session delete confirmation**:
Whether deleting a session shows the confirm dialog; stored in User settings; on when unset.
_Avoid_: delete confirm, confirm before delete, destructive confirm

**State Atom**:
Effect Atom that owns produce/update for one reactive piece of Harness application state. Shared state Atoms live in the ui context; desktop mounts and renders them. User settings is a write-through state Atom over `@lib/ao-home`; its value is an `AsyncResult` so first load is visible without a separate hydrate flag.
_Avoid_: store, reducer, settings service

**Mount Atom**:
One-shot `Atom.fn` used elsewhere to seed or load on app mount. Not used for User settings after the write-through state Atom (contrast term).
_Avoid_: hydrate Atom, bootstrap Atom (when meaning a mount-only procedure)

**Chat item**:
A single ordered unit in a session transcript — a user message, agent message, tool call, plan, etc. Derived from session updates (and locally appended user prompts), not sent on the wire. Not a pending interaction.
_Avoid_: Message, bubble, row, event

**Work region**:
The collapsible run of a turn's chat items between the user message and the Turn answer — tool calls, plans, agent thoughts, and interim agent messages.
_Avoid_: work run, work group, activity log

**Turn answer**:
The trailing agent messages of a turn, after its last work item; always visible below the Work region.
_Avoid_: final message, response

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: `connecting` → `initialized` → (`signing-in` when Antigravity Sign in is in flight) → `probing` → `ready`, or `error`. Describes Client-side setup only — not an ACP Session or Turn. `probing` runs the Config probe and buffers `session/list` until Ready.
_Avoid_: Status, connection state

**Sign in**:
User action that starts Antigravity ACP Google `oauth-personal` (`authenticate` on the wire) from Providers or the session composer when bootstrap reports “Antigravity is not signed in.” Distinct from Vendor CLI `login` and from ACP permission / elicitation URL mode.
_Avoid_: authenticate (wire-only), login, OAuth elicitation

**Antigravity auth URL**:
Google OAuth URL captured from the controlled Antigravity `BROWSER` helper stderr marker during Sign in; shown in the UI (copyable) and opened via Host OpenUrl.
_Avoid_: elicitation URL, redirect URI (when you mean this captured sign-in link)

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs `initialize`, Config probe, and buffered `session/list`, and retries on failure. One per mounted target; runs in parallel with siblings. Does not own the session transcript.
_Avoid_: Connection, provider instance, worker

## Sessions

**Session cwd**:
The absolute directory that is a session's primary filesystem context (ACP `cwd`). Chosen by the user when creating a session; carried on the History entry; required on `session/new`, `session/load`, and `session/resume`. Distinct from the Tauri host process cwd.
_Avoid_: Host cwd, working folder, project root (when you mean the ACP session parameter)

**Session History**:
Cached `session/list` results across mounted backend harnesses, and the list UI that presents them (desktop nav rail panel; VS Code sidebar view). Hydrated from ao-home before startup and grouped by session cwd except sessions classified into the No Folder group. Hydrated rows remain unavailable until a successful list refresh; each row carries its agent launch target. Lists sessions — not a session's transcript or ACP conversation replay.
_Avoid_: Roster, Session roster, session list, session catalog, session drawer

**No Folder group**:
Session History display group for Session cwds that match vendor Desktop projectless/scratch path-segment conventions (Claude `scratch-workspaces` + `scratch-YYYY-MM-DD-<6hex>` leaf; Codex consecutive `Documents`/`Codex`). One shared group across providers; not creatable from the Session History accordion; visibility gated by User settings (default shown). Does not write vendor Desktop state. Classification is segment-based by design (see `@lib/ui` ADR-0004); known miss: Codex custom `projectlessWorkspaceRoot` outside `Documents/Codex` will not classify.
_Avoid_: VS Code Workspace cwd absence, AO Session directory, project root, code `noFolder`

**Session header**:
The top row of the chat surface (desktop main chat and VS Code Chat) showing the Selected agent's icon and session title.
_Avoid_: chat header, title bar

**Session actions**:
The per-session menu of lifecycle actions (Close, Archive, Delete), each shown only when the agent supports it. Available on a History entry row and in the Session header (hidden while Virtual is Selected).

**History entry**:
One row in Session History: agent-reported identity and metadata (`sessionId`, session cwd, optional `title`) plus which agent launch target owns it. May exist without a session snapshot until the user creates or activates it.
_Avoid_: Roster entry, Session (when you mean the full working copy)

**Session snapshot**:
The Harness working copy for one session: session transcript, status, session configuration, usage, pending client request state, and session cwd when known (stamped on create, handoff, or activate). One per `sessionId` per backend harness. Session History remains the agent-reported list source for cwd when a snapshot has none yet.
_Avoid_: Session record, session object

**Session transcript**:
The ordered chat items for one session snapshot, derived from session updates and locally appended user prompts. Sole owner of that session’s chat items; survives backend harness reconnect.
_Avoid_: Chat log, message list, accumulator

**Session update apply**:
Pure Harness fold that turns one inbound ACP `session/update` into the next session snapshot (and History entry title when needed). Owns transcript reduction, available commands, usage, and config-option merge. Does not persist usage — that stays at the atom seam.
_Avoid_: foldSessionUpdate, session update reducer (transcript-only), demux

**Session status**:
Harness-reported lifecycle for a session snapshot: `activating` (load or resume in flight), `active` (loaded on the agent; prompts allowed), or `inactive` (not loaded, or closed via Deactivate). Not an ACP protocol concept.
_Avoid_: Session state (ambiguous with session configuration)

**Config option**:
An agent-reported session setting — a select (named choices such as model or mode) or a boolean on/off toggle. Populated from session activation responses and update notifications.
_Avoid_: Setting, preference, parameter

**Session configuration**:
Normalized config options from a `session/new`, `session/load`, or `session/resume` response. Cached on the session snapshot; drives model and mode selection in the Harness UI.
_Avoid_: Session state, session/new result

**Bind**:
Eager `session/new` for the Virtual session draft once absolute Session cwd, agent launch target, and Bootstrap `ready` are known: upserts the session snapshot into the harness sessions map and stores the Bound `sessionId` on the Virtual blob. Not a History entry; Selected stays Virtual. Distinct from Materialize.
_Avoid_: Materialize, session create (when you mean this Virtual-only step), activate

**Materialize**:
Harness step on first Send that promotes a Bound Virtual session into a History entry, Selects the Session arm (only if Selected is still Virtual), clears Virtual, and locks cwd/launch target — then prompts. Not the Bind RPC and not the sessions-map-only upsert helper used during Bind.
_Avoid_: Provision, hydrate, commit activation, apply session activation, Bind

**Config option index**:
Per-launch-target index of `defaultModelId` plus Config options keyed by model id (select and boolean, with probe `currentValue`s). Hydrated from ao-home cache and refreshed by Config probe during Bootstrap; consumed by Handoff. Not Session configuration or User settings.
_Avoid_: Provider config catalog, harness defaults, session configuration

**Config probe**:
Connection-setup work during Bootstrap `probing`: disposable-cwd `session/new` → capture by model → sequential `set_config_option` per other model → publish Config option index → best-effort `session/close` then best-effort `session/delete` (so soft-close adapters do not keep probe History entries). Not an Active session; never Materialize; never a durable History entry the user should see.
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
_Avoid_: Stop generation (vendor-specific), abort session, Close (that is Deactivate)

**Pending elicitation**:
Outstanding Agent `elicitation/create` held on a session snapshot until the user accepts, declines, or cancels. Ephemeral snapshot state — not a chat item.
_Avoid_: Elicitation form, form card, open elicitation

**Pending permission**:
Outstanding Agent `session/request_permission` held on a session snapshot until the user selects an option. Ephemeral snapshot state — not a chat item.
_Avoid_: Permission card, approval prompt, open permission

**Pending interaction**:
A pending elicitation or pending permission on a session snapshot. The Harness UI blocks sending another prompt while one is present.
_Avoid_: Pending client request, blocking dialog, modal

**Virtual session**:
At most one process-lifetime in-memory draft (composer text, agent launch target, Config choices, optional Session cwd, optional Bound `sessionId`) owned by Harness application state. Not a History entry until Materialize on first Send. May be Bound (Active on the agent via Bind) while Selected stays Virtual. Discarded on app restart. Leaving it keeps the blob when the Composer has content, else discards it (best-effort Bound teardown); leaving is never blocked by Bind / Materialize. Create New Session / cwd-group (+) ensure and Select it; Bind runs once cwd + launch target + Ready are known.
_Avoid_: Draft session, pending session, unsaved session

**Selected**:
App-wide UI focus: either the Virtual session or a real Session by `sessionId`, or none (desktop normally keeps Virtual or a Session selected). Determines which transcript/composer the main chat shows and what the session-state panel displays. Not per-agent.
_Avoid_: Selected session (when you mean the union including Virtual), current session, focused session

**Active session**:
A session loaded on the ACP Agent (`session/new`, `session/load`, or `session/resume` completed; ends at `session/close`). Includes Bound-but-still-Virtual sessions. Multiple may be active per agent simultaneously; only the Selected Session arm accepts prompts after Materialize.
_Avoid_: Open session, live session

**Deactivate**:
Harness action that sends ACP `session/close` for an Active session (after a Prompt turn cancel if a prompt is in flight) and marks it `inactive`. The session stays in Session History with its transcript; clicking the row reactivates it. Labeled **Close** in the Harness UI and shown only when the agent advertises `sessionCapabilities.close`. Memory savings depend on the adapter (soft close for Gemini/Antigravity per ADR 0010; best-effort for Cursor/Antigravity per ADR 0013/0014).
_Avoid_: End session, Close (UI label only — use Deactivate in code/docs)

## Agent backends

**Agent provider**:
An external coding-agent backend the Harness can connect to: **Codex**, **Claude**, and (when compile-time beta flags enable them) **Antigravity** and **Cursor**. Each provider is reached as an ACP Agent subprocess, not via an in-process LLM SDK.
_Avoid_: Model, LLM, vendor, integration

**Agent launch target**:
The spawn identity for a selectable harness connection — an ACP adapter from the adapter resource tree (`codex-acp`, `claude-agent-acp`), a native Vendor CLI ACP process (`cursor-acp` → `cursor-agent acp`), or a Managed ACP Agent (`antigravity-acp` → `agy_acp_server`). Distinct from the agent provider name (Codex, Claude, Antigravity, Cursor).
_Avoid_: Backend (ambiguous with Tauri host), provider id

**ACP adapter**:
A stdio process the Harness spawns that speaks ACP on stdin/stdout. Wraps a vendor CLI or SDK that is not ACP-native (Codex via [`codex-acp`](https://github.com/agentclientprotocol/codex-acp), Claude via [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)).
_Avoid_: Bridge, wrapper, proxy, shim

**Adapter resource tree**:
Isolated ACP adapter install at repo-root `acp-adapter-resources/` (own lockfile, hoisted `node_modules`; shared with the VS Code extension) copied into the Tauri application package for provider launch. Shared by `tauri:dev` and packaged builds.
_Avoid_: node_modules, Vite assets, sidecar, bundled adapters (ambiguous with Vite)

**Vendor CLI**:
User-installed agent CLI on PATH (`codex`, `claude`, `cursor-agent`) that an ACP adapter or native ACP agent requires. The Harness detects it and does not install it.
_Avoid_: Agent binary, provider CLI, global install

**Vendor CLI ACP**:
A Vendor CLI that implements ACP directly on PATH. Cursor CLI (`cursor-agent acp`) is the harness example — native spawn, no adapter resource entry.
_Avoid_: Managed ACP Agent (Harness-downloaded binary)

**Managed ACP Agent**:
Harness-downloaded ACP binary under Agent Orchestrator home (Antigravity `agy_acp_server` pin), not a Vendor CLI on PATH and not an adapter resource tree entry. Distinct from Vendor CLI ACP.
_Avoid_: sidecar, PATH install, gemini-acp

**Native ACP agent**:
An ACP-speaking process the Harness spawns without a Node adapter in front — Vendor CLI ACP (Cursor) or Managed ACP Agent (Antigravity).
_Avoid_: Built-in agent, direct agent, first-party server

**Provider launch**:
How the Harness starts a provider subprocess: executable, arguments, working directory, and environment — from the adapter resource tree for Node shims, by spawning a Vendor CLI ACP mode (`cursor-agent acp`), or by spawning a Managed ACP Agent (`agy_acp_server`) — yielding a stdio ACP Agent the Harness connects to via `@libs/effect-acp`.
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
Portable aggregate of BundledResource, ChildProcessSpawner, Clipboard, FileSystem, OS, and Path — see [`libs/context-services/GLOSSARY.md`](../../libs/context-services/GLOSSARY.md). Injected once at desktop Host + Atom runtime composition; desktop fulfills it with Tauri services.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

**Tauri services**:
Desktop Live Adapter of Host services in `@lib/context-services-tauri` (`TauriServicesLive`) — analogous to `@effect/platform-node`'s `NodeServices.layer`. Composed once into the Host + Atom runtime factory.
_Avoid_: Platform layer, context-services (the portable package name), adapters

## Observability

**Action root**:
A Harness-initiated unit of work that owns one distributed trace — either a **user action** (composer send, session lifecycle, config change, handoff, restart) or a **system action** (bootstrap, Session History refresh). Sibling action roots do not nest under each other. Responding to a pending interaction is not an action root when a turn is open — see **Turn-correlated work**.
_Avoid_: Request, span (when you mean the product unit), operation

**User action**:
An action root triggered from the Harness UI.
_Avoid_: Background job, job, task

**System action**:
An action root that keeps a backend harness or Session History coherent without a direct UI gesture for that work (bootstrap, Session History refresh).
_Avoid_: Background job, job, task

**Turn-correlated work**:
Agent→Client traffic that belongs to an open ACP **Turn** (see `@libs/effect-acp`): session updates, elicitation, permission requests, and the user’s respond to those. While a turn is in flight for a session, this work combines into that turn’s trace. When no turn is open, the same traffic (including an orphan respond) is its own short root — not attached to bootstrap or connection setup, and not promoted to a standing user-action term.
_Avoid_: RPC child, notification, demux event, action root (for respond-while-turn-open)

**Connection setup**:
The short setup slice of bringing a backend harness online (spawn, connect, initialize, first Session History list). An action root of its own — not a parent for later turns or lifetime Agent→Client traffic.
_Avoid_: Connection span, live connection, session (when you mean setup)

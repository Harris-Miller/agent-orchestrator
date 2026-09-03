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
A single ordered unit in the Harness UI transcript — a user message, agent message, tool call, plan, etc. Derived from session updates (and locally appended user prompts), not sent on the wire.
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
Cached `session/list` results for an agent; shown in the Harness UI grouped by session cwd. Can be refreshed with another `session/list` without restarting the backend harness.
_Avoid_: Session list, session catalog, session drawer

**Roster entry**:
One row in the session roster: agent-reported identity and metadata (`sessionId`, session cwd, optional `title`). May exist without a session snapshot until the user creates or activates it.
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

**Usage**:
Agent-reported context-window fill and cumulative session cost on a session snapshot. Not a chat item.
_Avoid_: Usage readout, token usage, telemetry, context meter

**Pending client request**:
Harness flag on a session snapshot while a client→agent RPC is outstanding for that session (`session/prompt` or a config-option change). Blocks overlapping outbound RPCs until the response arrives. Harness UX policy — stricter than ACP minimum, which allows mode changes during generation.
_Avoid_: In flight, loading, busy flag

**Selected session**:
Per-agent UI focus; determines which transcript the main chat shows and which session receives prompts. One per agent; persists when switching agents.
_Avoid_: Current session, focused session

**Active session**:
A session loaded on the ACP Agent (`session/new`, `session/load`, or `session/resume` completed; ends at `session/close`). Multiple may be active per agent simultaneously; only the selected session accepts prompts.
_Avoid_: Open session, live session

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

**Host cwd**:
The Tauri host process current working directory from the OS service. Used for provider launch and fixture resolution — not a session's project context.
_Avoid_: Session cwd

**Tauri services**:
Live Effect layers in `src/context-services/` that implement portable `@lib/context-services` and platform primitives (OS, Path, FileSystem, ChildProcessSpawner) on top of Tauri — analogous to `@effect/platform-node`'s `NodeServices.layer`.
_Avoid_: Platform layer, context-services (the portable package name), adapters

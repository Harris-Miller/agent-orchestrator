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
Full-page Harness UI route (`/settings/$category`, default entry `/settings/general`) for browsing preferences; reads and writes User settings through `@lib/hoa-home`. Both hosts share the responsive SettingsShell and sectioned Settings panes from `@lib/ui`.
_Avoid_: Settings modal, settings dialog, config screen

**Theme preference**:
User-chosen Harness UI theme id stored in User settings. Always picks the file-icon set; it picks the colors too except in VS Code with Match VS Code theme on (where it is disabled) (see the ui glossary).
_Avoid_: color mode, appearance mode, MUI theme (when meaning the preference)

**Session delete confirmation**:
Whether deleting a session shows the confirm dialog; stored in User settings; on when unset.
_Avoid_: delete confirm, confirm before delete, destructive confirm

**State Atom**:
Effect Atom that owns produce/update for one reactive piece of Harness application state. Shared state Atoms live in the ui context; desktop mounts and renders them. User settings is a write-through state Atom over `@lib/hoa-home`; its value is an `AsyncResult` so first load is visible without a separate hydrate flag.
_Avoid_: store, reducer, settings service

**Mount Atom**:
One-shot `Atom.fn` used elsewhere to seed or load on app mount. Not used for User settings after the write-through state Atom (contrast term).
_Avoid_: hydrate Atom, bootstrap Atom (when meaning a mount-only procedure)

**Chat item**:
A single ordered unit in a session transcript — a user message, agent message, tool call, plan, etc. Derived from session updates (and locally appended user prompts), not sent on the wire. Not a pending interaction.
_Avoid_: Message, bubble, row, event

**Work region**:
The collapsible run of a turn's chat items between the user message and the Turn answer — Work items and Interim agent messages. An Elicitation summary splits it, so a turn may have several. Starts collapsed and only the user opens or closes it; while its Prompt turn is in flight and it is collapsed, it previews its latest Work item. When open, its header stays in view until the whole region scrolls past.
_Avoid_: work run, work group, activity log

**Work item**:
A chat item that records the agent working rather than answering: a tool call, plan, agent thought, or subagent.
_Avoid_: action, activity, step

**Interim agent message**:
An agent message inside a Work region, followed later in the turn by another Work item. It separates Work segments; an agent thought is a Work item, not an Interim agent message.
_Avoid_: thought response, mid-turn reply

**Work segment**:
The consecutive Work items of a Work region between Interim agent messages, subagents or other non-Work items (or the region's edges); dividers render on their own and are not counted in segments. Collapsible on its own, starts collapsed (except the first one when an open region first splits, so what the user was reading stays visible), and never previews. A region with a single Work segment shows its Work items directly.
_Avoid_: step, action group

**Turn answer**:
The trailing agent messages of a turn, after its last Work item; always visible below the Work region.
_Avoid_: final message, response

**Elicitation summary**:
A chat item recording an accepted form-mode Elicitation: each field the user set and the value chosen, with secret values masked, and any Elicitation note shown under the chosen value. Created by the Client at accept time, not sent on the wire, and not restored by `session/load`. Always visible, never inside a Work region.
_Avoid_: answers, answered questions, elicitation result

**Elicitation note**:
An optional free-text field paired with a choice question of a form-mode Elicitation. Adds context beside the picked option instead of replacing it, and is sent as its own content key.
_Avoid_: second question, Other (a different mechanism — it replaces the pick)

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: `connecting` → `initialized` → (`signing-in` when Antigravity Sign in is in flight) → `usable` → `ready`, or `error`. Describes Client-side setup only — not an ACP Session or Turn. `usable`: initialize (and Sign in) is done and a Config option index exists (cached, or seeded by the Config probe), so session RPCs work. `ready`: `session/list` has also published.
_Avoid_: Status, connection state

**Sign in**:
User action that starts Antigravity ACP Google `oauth-personal` (`authenticate` on the wire) from Providers or the session composer when bootstrap reports a `NotSignedIn` Harness failure (from the ACP `auth_required` error or the Sign in timeout, never from message text) Distinct from Vendor CLI `login` and from ACP permission / elicitation URL mode.
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
The Tracked sessions across mounted backend harnesses, and the list UI that presents them (desktop nav rail panel; VS Code sidebar view). Hydrated from hoa-home before startup and grouped by Project cwd (groups ordered alphabetically by directory name, case-insensitive; sessions within a group unarchived before archived, each newest Last prompt time first); each row carries its agent launch target. Only sessions the user created in-app or chose to **Import** appear; `session/list` is never run in the background. When browsing, the UI hides archived rows (an app-owned flag once tracked) unless Show archived is on; while it is off, archived rows count as missing for selection. Lists sessions — not a session's transcript or ACP conversation replay. Desktop cwd groups cap their rows (see **Show more box**).
_Avoid_: Roster, Session roster, session list, session catalog, session drawer

**Last prompt time**:
When the user last prompted a session, as the Agent's `session/list` row reports it; a row without one has its `updatedAt` in its place. The Session History order key: agent activity that is not a user prompt (a long turn finishing, a background update) does not move a row. A live Prompt turn end advances it optimistically, never backwards, and only on a row that already carries one (a row without one keeps falling back to `updatedAt`).
_Avoid_: last activity, last updated, recency

**Activity state**:
What the Agent's `session/list` row says a session is doing: running, requires action (awaiting the user's input), or error. Not shown on the Session History row; visible in the Developer panel's Session State tab. An idle row, an unknown value, a row without one (Codex knows it only for threads it has loaded) have none. A snapshot read at list time, not live: it changes only when the row is next listed, except that a live Prompt turn end clears a running or requires-action state on that session's row.
_Avoid_: status, session status

**Fork source**:
The session an Agent's `session/list` row says a forked session was forked from. Not shown on the Session History row; visible in the Developer panel's Session State tab.
_Avoid_: parent session, origin (a Subagent session has a parent; a fork has none)

**Show archived**:
User settings toggle, set from the Session History header, that includes archived History entries when browsing Session History, marked as archived. Session History search includes archived entries regardless of this toggle. Off when unset. Filters the Tracked sessions only, and Import's list the same way (`@lib/ui` ADR-0008). Archive flips the app-owned flag and also calls the agent's archive where it declares one; activating an archived History entry unarchives it first.
_Avoid_: archive filter, list filter (when you mean this toggle)

**Show more box**:
Desktop-only control under a long Session History cwd group that toggles the group between its first rows and all of them. Session-only UI state; the Pinned section never has one.
_Avoid_: pagination, load more (when you mean this local toggle; no fetch happens)

**Project**:
An absolute directory the user chose to bring into the app, persisted in hoa-home (one list shared across launch targets and host apps). Desktop Session History shows Tracked sessions only for Projects. Added through the Project Selection Modal (the "Add Project" row or the Composer's "Choose Project", idempotent) and removed only by **Stop tracking**. Never added from Config probe cwds; VS Code adds its Workspace cwd the first time a session is tracked there. Paths compare exact after trailing-separator normalization.
_Avoid_: tracked cwd, remembered folder, saved cwd, workspace

**Project cwd group**:
A desktop Session History accordion group for one Project, always shown (blank when it has no sessions), sorted alphabetically by directory name (a parent-path caption appears only when two Projects share a basename). Header: "+" (create a session there) and a `⋯` menu (Import, Stop tracking).
_Avoid_: empty cwd group, ghost group

**Tracked session**:
A session the app owns a record of: created in-app (when its Virtual session materializes, or a fork or handoff creates it) or chosen through **Import**. Persisted per launch target and cwd (hoa-home Tracked sessions document). The only source for Session History, Recent sessions and Session History search. Delete is the only way to fully remove one; Archive never un-imports it. Title and Last prompt time change only from live signals for loaded sessions; a never-loaded one keeps its import-time snapshot.
_Avoid_: listed session, cached row, imported session (when you mean any Tracked session)

**Import**:
Choosing existing agent sessions of a Project cwd to track: a panel mode of Session History fed by `session/list` (see the `@lib/ui` glossary). Confirming a row tracks and Selects it only if it loads. An archived row imports as archived.
_Avoid_: sync, reload sessions

**Stop tracking**:
The user action, on any Project, that removes it: its rows leave in-app Session History, while its Tracked sessions stay dormant (hidden, still in hoa-home) and come back when the Project is added again. Never deletes sessions on the agent and never deletes pins. With Active sessions in the Project, asks for confirmation, then cancels in-flight prompts and Deactivates each (an agent without `sessionCapabilities.close` is marked inactive locally; a close failure is reported and does not block). If the Selected session belonged to the Project, Selected resets to a fresh Virtual draft. VS Code still shows the Workspace cwd's Tracked sessions.
_Avoid_: untrack, forget project, delete folder (nothing on disk changes)

**Session header**:
The top row of the chat surface, the same in desktop main chat and VS Code Chat: the agent launch target icon and Session title of what is Selected (`New Session` while Virtual), plus Session actions when they apply (see **Session actions**): Rename right beside the title, the other actions as icon buttons at the far end (no Pin/Unpin there). When the header row is narrow they collapse back into the menu (Rename included, still without Pin/Unpin). Each host adds its own controls before and after it.
_Avoid_: chat header, title bar

**Pin**:
A user mark on a History entry (per launch target, persisted in hoa-home). A pinned session renders once, in the Pinned section, not in its cwd group. Pinned+archived sessions stay pinned; they are hidden unless Show archived is on. Only Tracked sessions can render pinned; a pin whose session is not tracked (or whose cwd is not a loaded Project) is hidden but kept, and a pin is removed when its session is deleted in the UI.
_Avoid_: favorite, star, bookmark

**Pinned section**:
The top Session History region listing visible pinned entries, unarchived before archived, each newest Last prompt time first. Desktop: a default-expanded accordion above the cwd groups with no "+", hidden when empty, each row captioned with its cwd basename. VS Code: the same region above the rest, no caption, filtered to the Workspace cwd.

**Session actions**:
The per-session actions (a menu on a History entry row, icon buttons without Pin/Unpin in the Session header): Pin/Unpin (always shown; local only, works for unavailable rows), Deactivate (UI label "Close"), Archive and Rename (Deactivate and Rename only when the agent supports them; Archive always, flipping the app-owned flag locally and calling the agent's archive best-effort where it declares one), plus Delete (always shown; optimistic: the confirm dialog closes, Selected clears and the entry, its Tracked session record and its Pin go at once; the agent's delete runs in the background only where the provider supports it, a failure is shown as an error toast and the session stays untracked; where unsupported the dialog says the transcript stays on the agent). Archive keeps the History entry, marked archived, and drops only the session snapshot. On an archived History entry they are Unarchive (which also opens it), Pin/Unpin, and Delete. Both presentations share the same actions and availability rules. Available on a History entry row and in the Session header (hidden while Virtual is Selected and while a Subagent view is shown, since they act on the Selected session, not the Subagent session).
_Avoid_: dotdotdot menu, kebab menu, session options

**Bulk select**:
A Session History mode, entered from the header, in which each available History entry row shows a checkbox and clicking a row toggles it instead of activating it. A **Bulk action** (Archive, Unarchive, Delete) then applies to every checked entry it fits: Archive to unarchived entries, Unarchive to archived ones (without opening them, unlike the per-row Unarchive), Delete to any. Entries may span cwd groups, the Pinned section and launch targets. Entries that leave the visible list (deleted, or archived while Show archived is off) drop out of the selection. A Bulk action continues past a failed entry, reports the failure as an error toast, and then leaves Bulk select. Delete asks for one confirmation covering all checked entries, unless the confirm-delete setting is off. Session History search results are not selectable.
_Avoid_: multi-select, batch edit

**Session title**:
The display name of a History entry: the agent-reported `title`, which the user may override by renaming it inline (from Session actions or by double-clicking the title). Shown on the History entry row and in the Session header. Rename shows the new title immediately and restores the previous one if the agent rejects it.
_Avoid_: Thread name, session name, label

**History entry**:
One row in Session History (a Tracked session's row): agent-reported identity and metadata (`sessionId`, session cwd, optional `title`) plus which agent launch target owns it. May exist without a session snapshot until the user creates or activates it.
_Avoid_: Roster entry, Session (when you mean the full working copy)

**Session snapshot**:
The Harness working copy for one session: session transcript, status, session configuration, usage, pending client request state, and session cwd when known (stamped on create, handoff, or activate). One per `sessionId` per backend harness. Session History remains the agent-reported list source for cwd when a snapshot has none yet.
_Avoid_: Session record, session object

**Session transcript**:
The ordered chat items for one session snapshot, derived from session updates and locally appended user prompts. Sole owner of that session’s chat items; survives backend harness reconnect.
_Avoid_: Chat log, message list, accumulator

**Session state panel**:
The desktop right panel (chat header open button, `PanelRightOpen`; panel header close button, `PanelRightClose`) that shows the Selected session's Session snapshot. "Session state" is avoided for the underlying data (see Session status, Session configuration); this term names only the panel.
_Avoid_: Right panel, Panel, state drawer

**Session update apply**:
Pure Harness fold that turns one inbound ACP `session/update` into the next session snapshot (and History entry title when needed). Owns transcript reduction, available commands, usage, and config-option merge.
_Avoid_: foldSessionUpdate, session update reducer (transcript-only), demux

**Session status**:
Harness-reported lifecycle for a session snapshot: `activating` (load or resume in flight), `active` (loaded on the agent; prompts allowed), or `inactive` (not loaded, or closed via Deactivate). Not an ACP protocol concept.
_Avoid_: Session state (ambiguous with session configuration)

**Replay complete**:
The history of a loading Session has fully arrived, before the load itself finishes. A later load failure keeps that history instead of restoring the previous transcript.

**Config option**:
An agent-reported session setting — a select (named choices such as model or mode) or a boolean on/off toggle. Populated from session activation responses and update notifications.
_Avoid_: Setting, preference, parameter

**Recommended value**:
The choice an agent marks as suggested on its model or effort Config option (AIR `recommendedValue`), independent of the option's current value. The Composer's model picker marks the recommended model and the recommended reasoning effort with a "Recommended" marker. Never reorders, hides, or selects anything.
_Avoid_: Default (the agent's own default model is a different thing)

**Session configuration**:
The Config options of one Session as the agent last reported them: first from its `session/new`, `session/load`, or `session/resume` response, then from each `session/set_config_option` response and config option update, plus a user Config change the agent has not answered yet. Held on the session snapshot; the selected model and mode are its `model` and `mode` options, not separate values. Config option updates change only this configuration (the Composer's choices); they never appear in the Session transcript.
_Avoid_: Session state, session/new result, live Config, selected model id (as a separate value)

**Config change**:
A user's change to one Config option of an active Session: shown at once, sent with `session/set_config_option`, and withdrawn if that request fails, unless the agent has since reported a different value for the option. Refused outright while the Session cannot take a client request. Not the Config diffs that Materialize, Handoff, and activation apply themselves.
_Avoid_: set config, config update (ambiguous with the agent's config option update)

**Bind**:
Eager `session/new` for the Virtual session draft once absolute Session cwd, agent launch target, and Bootstrap `usable` are known: upserts the session snapshot into the harness sessions map and stores the Bound `sessionId` on the Virtual blob. Optimistic and latest-wins (never locks the composer); a superseded Bind's session is torn down in the background. Not a History entry; Selected stays Virtual. Distinct from Materialize.
_Avoid_: Materialize, session create (when you mean this Virtual-only step), activate

**Materialize**:
Harness step on first Send that promotes a Bound Virtual session into a History entry, Selects the Session arm (only if Selected is still Virtual), clears Virtual, and locks cwd/launch target — then prompts. Not the Bind RPC and not the sessions-map-only upsert helper used during Bind.
_Avoid_: Provision, hydrate, commit activation, apply session activation, Bind

**Config option index**:
Per-launch-target index of `defaultModelId` plus Config options keyed by model id (select and boolean, with probe `currentValue`s). Hydrated from hoa-home cache, seeded by Config probe when the cache is missing, then kept current by Lazy hydrate; consumed by Handoff. Not Session configuration or User settings.
_Avoid_: Provider config catalog, harness defaults, session configuration

**Config probe**:
Connection-setup work that runs only when no cached Config option index exists, before Bootstrap `usable`: one throwaway session in a disposable directory yields the model list and the default model's row, which are published as the Config option index; the throwaway session is then closed and deleted best-effort so soft-close adapters do not keep it in Session History. Other models' rows are not probed; see **Lazy hydrate**. Not an Active session; never Materialize; never a durable History entry the user should see.
_Avoid_: Session create, materialize, activate

**Lazy hydrate**:
Updating the Config option index from a live agent response instead of probing. Creating a session replaces the default model's row and the advertised model list (rows for models no longer advertised are dropped). Picking a model replaces that model's row and clears it from Unavailable models, and its response also replaces the advertised list (models no longer advertised lose their rows and Unavailable marks; the default moves to the picked model if it was dropped); if the agent refuses the pick the model becomes Unavailable (a transport failure does not). A Virtual draft with a Bound session picks an uncached model on that session to learn its row, and the Bound session's Session configuration then shows that pick. Rows keep the values the agent returned.
_Avoid_: refresh, re-probe

**Usage**:
Agent-reported context-window fill and cumulative session cost on a session snapshot. Not a chat item.
_Avoid_: Usage readout, token usage, telemetry, context meter

**Handoff**:
Harness action that asks the source active session to call the hub's `submit_handoff` tool with a handoff document, then creates a new session on a chosen agent launch target (same session cwd), applies chosen config options, and seeds it with a `session/prompt` containing that document. Fails when the source turn ends without the tool call, and is unavailable while the source session has no hub credential. Not an ACP protocol concept; not a durable Harness record (v1). Gated by the User setting Experimental: App Orchestrated Agents (`appOrchestratedAgentsEnabled`, off when unset; also gates Spawned subagent sessions): while off, the Session actions strip has no Handoff button and the Hub client does not start. Changing it reactivates sessions (see **Session reactivation**).
_Avoid_: Transfer, migrate session, export chat

**Hub**:
The one machine-wide local process that agents call Harness tools on (hand a Handoff document back, list usable launch targets, spawn or cancel a Spawned subagent session). It only routes: each session's credential names the Harness client that owns the session, and the tool's logic runs in that Harness. Whichever client finds none running starts it; it exits shortly after its last client disconnects. Shared by the desktop app and every local VS Code window.
_Avoid_: MCP server (ambiguous with servers the user configured), daemon, broker

**Hub client**:
A Harness's connection to the Hub: makes sure one is running, issues and revokes session credentials (a credential's secret is its bearer token), answers the tool calls routed to its sessions, and reports whether the Hub is available. While it is not, sessions start without a credential and Handoff is unavailable, with the reason; such a session stays unconnected until it is reopened or reactivated (see **Session reactivation**).
_Avoid_: hub connection as a name for the role (in code, `HubConnection` is the transport the client installs; the client is the role)

**Session reactivation**:
What changing the User setting Experimental: App Orchestrated Agents (on or off) does: every active session is Deactivated, its Provider is restarted, and the session is Activated again so it picks up the new state, cancelling any running Prompt turn. Only Providers with an active session restart, never one the user stopped; a Provider that fails to come back leaves its sessions inactive. It applies to any change of the setting's effective value, however it arrives (the Settings pane, an external edit of the settings file, or another window). Spawned subagent sessions are skipped (they end with their parent) and the Bound Virtual session is rebound; Selected is kept.
_Avoid_: Reload sessions (the Project list refresh)

**Pending client request**:
Harness flag on a session snapshot while a client→agent RPC is outstanding for that session, discriminated as a prompt turn or a config-option change. Blocks overlapping outbound RPCs until the response arrives. Prompt-kind pending enables Prompt turn cancel in the Harness UI; config-kind pending does not. Harness UX policy — stricter than ACP minimum, which allows mode changes during generation. Distinct from a pending interaction (Agent→Client).
_Avoid_: In flight, loading, busy flag

**Prompt turn cancel**:
Harness action that sends ACP `session/cancel` for an in-flight prompt turn on a session. The session stays active. Distinct from Deactivate (`session/close`), elicitation cancel, and `$/cancel_request`.
_Avoid_: Stop generation (vendor-specific), abort session, Close (that is Deactivate)

**Steering**:
Harness action that injects a new user message into the in-flight prompt turn via `_session/steering` instead of waiting for the turn to end. Only offered when Steering supported and no pending interaction; the steered message joins the same turn (no turn timing of its own, shown with a Steering label). If the Agent reports no running turn (`promptRequired`), the Harness sends the draft as a new prompt turn once the ended turn's `session/prompt` response has arrived; if it does not arrive within a few seconds, the Steering fails. Distinct from a Queued message, which waits for the turn to end instead of joining it.
_Avoid_: interrupt, follow-up message (Queue is a different action: see Queued message)

**Queued message**:
The one message per Session a user chose to Queue instead of Steer while a prompt turn is in flight and Steering is offered. Held in the Composer (memory only; merged, newline-joined, if queued again) and sent as a new prompt turn once the in-flight turn is over. Prompt turn cancel returns it to the draft; a refused or failed-to-start send returns it too. Which of Steering or Queue the Send button does is the `midTurnSend` User setting; a second button beside Send offers the other while Steering is offered.
_Avoid_: Queued prompt, outbox, prompt queue

**Steering supported**:
Agent advertises `_meta.steering.supported: true` on the `initialize` result (top level, not under the ACP `agentCapabilities` field). One of the Agent capabilities (ui context); gates Steering. When absent, the Composer is still editable mid-turn but cannot send and Prompt turn cancel stays the primary action.
_Avoid_: promptQueueing (a separate Claude-only flag we ignore), steer capability

**Pending elicitation**:
Outstanding Agent `elicitation/create` held on a session snapshot until the user accepts, declines, or cancels. Ephemeral snapshot state — not a chat item.
_Avoid_: Elicitation form, form card, open elicitation

**Pending permission**:
Outstanding Agent `session/request_permission` held on a session snapshot until the user selects an option. Ephemeral snapshot state — not a chat item.
_Avoid_: Permission card, approval prompt, open permission

**Pending interaction**:
A pending elicitation or pending permission on a session snapshot. The Harness UI blocks sending another prompt while one is present. Each kind is a queue per Session (or Subagent session): the oldest is shown, with a count of the ones waiting behind it, and answering it shows the next. Answered at most once; one that leaves the Backend harness snapshot unanswered, shown or waiting, is cancelled on the agent (its Session is deactivated, deleted, archived or reloaded, its Prompt turn cancelled, or the connection is lost). A Spawned subagent session's mirror never cancels its child's.
_Avoid_: Pending client request, blocking dialog, modal

**Virtual session**:
At most one process-lifetime in-memory draft (composer text, agent launch target, Config choices, optional Session cwd, optional Bound `sessionId`) owned by Harness application state. Not a History entry until Materialize on first Send. May be Bound (Active on the agent via Bind) while Selected stays Virtual. Discarded on app restart. Leaving it keeps the blob when the Composer has content, else discards it (best-effort Bound teardown); leaving is never blocked by Bind / Materialize. New Session / cwd-group (+) ensure and Select it; Bind runs once cwd + launch target are known and the provider is Bootstrap `usable`.
_Avoid_: Draft session, pending session, unsaved session

**New session launcher**:
The desktop Sessions page's empty-Virtual-session surface, where the agent and Project are picked before describing the work. VS Code shows Recent sessions there instead.
_Avoid_: new session screen, welcome screen

**Selected**:
App-wide UI focus: either the Virtual session or a real Session by `sessionId`, or none (transient on desktop: a cleared Selected — boot, Archive, Delete, Deactivate — falls back to the Virtual session once no Materialize is running). Determines which transcript/composer the main chat shows and what the Session state panel displays. Not per-agent.
_Avoid_: Selected session (when you mean the union including Virtual), current session, focused session

**Active session**:
A session loaded on the ACP Agent (`session/new`, `session/load`, or `session/resume` completed; ends at `session/close`). Activating an archived session sends `_session/unarchive` before the load; an unarchive that succeeds stays even if the load then fails. Includes Bound-but-still-Virtual sessions. Multiple may be active per agent simultaneously; only the Selected Session arm accepts prompts after Materialize.
_Avoid_: Open session, live session

**Deactivate**:
Harness action that sends ACP `session/close` for an Active session (after a Prompt turn cancel if a prompt is in flight) and marks it `inactive`. The session stays in Session History with its transcript; clicking the row reactivates it. Labeled **Close** in the Harness UI and shown only when the agent advertises `sessionCapabilities.close`. Close failure policy: ADR 0013/0014. Memory savings depend on the adapter.
_Avoid_: End session, Close (UI label only — use Deactivate in code/docs)

## Agent backends

**Agent provider**:
An external coding-agent backend the Harness can connect to: **Codex**, **Claude**, and (when compile-time beta flags enable them) **Antigravity** and **Cursor**. Each provider is reached as an ACP Agent subprocess, not via an in-process LLM SDK.
_Avoid_: Model, LLM, vendor, integration

**Agent launch target**:
The spawn identity for a selectable harness connection — an ACP adapter from a Provider runtime (`codex-acp`, `claude-agent-acp`), a native Vendor CLI ACP process (`cursor-acp` → `cursor-agent acp`), or a Managed ACP Agent (`antigravity-acp` → `agy_acp_server`). Distinct from the agent provider name (Codex, Claude, Antigravity, Cursor).
_Avoid_: Backend (ambiguous with Tauri host), provider id

**ACP adapter**:
A stdio process the Harness spawns that speaks ACP on stdin/stdout. Wraps a vendor CLI or SDK that is not ACP-native (Codex via [`codex-acp`](https://github.com/agentclientprotocol/codex-acp), Claude via [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)).
_Avoid_: Bridge, wrapper, proxy, shim

**Provider runtime**:
The user-downloaded program that backs a launch target (an npm install of `claude-agent-acp` / `codex-acp`, or the extracted Antigravity binaries), stored under `~/.hoa/providers/<id>/runtime/<version>/`. Replaces the former bundled adapter resource tree.
_Avoid_: Adapter resource tree, bundled adapters, node_modules

**Vendor CLI**:
User-installed agent CLI on PATH (`codex`, `claude`, `cursor-agent`) that an ACP adapter or native ACP agent requires. The Harness detects it and does not install it.
_Avoid_: Agent binary, provider CLI, global install

**Vendor CLI ACP**:
A Vendor CLI that implements ACP directly on PATH. Cursor CLI (`cursor-agent acp`) is the harness example — native spawn, no adapter resource entry.
_Avoid_: Managed ACP Agent (Harness-downloaded binary)

**Managed ACP Agent**:
Harness-downloaded ACP binary under HOA home (Antigravity `agy_acp_server` pin), not a Vendor CLI on PATH and not an adapter resource tree entry. Distinct from Vendor CLI ACP.
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

## VS Code extension install

**Bundled VS Code extension**:
The `.vsix` of the HOA VS Code extension shipped inside the desktop Bundle, stamped with the desktop app version. The only source the desktop app installs the extension from.
_Avoid_: Marketplace extension, plugin, add-on

**VS Code CLI**:
The `code` executable the desktop app drives to list and install extensions: `code` on PATH, else the CLI at VS Code's standard app-bundle path for the OS.
_Avoid_: VS Code binary, editor command

**VS Code extension install state**:
How the Bundled VS Code extension compares with what the VS Code CLI reports installed: `not-installed`, `up-to-date`, `outdated` (installed semver below bundled), or `newer-installed` (installed semver above bundled; never offered a downgrade).
_Avoid_: Extension status, install status

**VS Code extension availability**:
What the VS Code extension row can offer on this Host, derived from the Bundled VS Code extension and the VS Code CLI: hidden (unsupported Host, `.vsix` not bundled, or VS Code not found), manual install (VS Code found but no CLI that can list extensions), or ready with a **VS Code extension install state**.
_Avoid_: Extension status, install status

**Skipped extension version**:
The Bundled VS Code extension version the user chose to skip in the update dialog, stored in User settings; the dialog returns when the bundled version differs from it.
_Avoid_: Ignored version, dismissed update

## Observability

**Private data**:
User and workspace content that never reaches telemetry as plain text: prompt and Agent response text, file content, file paths and `file://` URIs (session cwd included), URLs, command lines, and environment values. Identifiers (session id, launch target, pid), counts, and exit codes are not private data.
_Avoid_: PII, sensitive data, secrets

**Action root**:
A Harness-initiated unit of work that owns one distributed trace — either a **user action** (composer send, session lifecycle, config change, handoff, restart) or a **system action** (bootstrap). Sibling action roots do not nest under each other. Responding to a pending interaction is not an action root when a turn is open — see **Turn-correlated work**.
_Avoid_: Request, span (when you mean the product unit), operation

**User action**:
An action root triggered from the Harness UI.
_Avoid_: Background job, job, task

**System action**:
An action root that keeps a backend harness or Session History coherent without a direct UI gesture for that work (bootstrap).
_Avoid_: Background job, job, task

**Turn-correlated work**:
Agent→Client traffic that belongs to an open ACP **Turn** (see `@libs/effect-acp`): session updates, elicitation, permission requests, and the user’s respond to those. While a turn is in flight for a session, this work combines into that turn’s trace. When no turn is open, the same traffic (including an orphan respond) is its own short root — not attached to bootstrap or connection setup, and not promoted to a standing user-action term.
_Avoid_: RPC child, notification, demux event, action root (for respond-while-turn-open)

**Connection setup**:
The short setup slice of bringing a backend harness online (spawn, connect, initialize). An action root of its own — not a parent for later turns or lifetime Agent→Client traffic.
_Avoid_: Connection span, live connection, session (when you mean setup)

**Subagent session**:
A child ACP session of a parent session, kept in `subagents` and never selectable as a top-level session: no history row of its own, activation, or Composer. Either native (announced by the parent's agent with `subagent_spawned`, always on the parent's own launch target) or a **Spawned subagent session** (started by the Harness, always on a different launch target than its parent). Has a **parent** (announcing session; never reparented) and its own transcript, pending interactions, **work state**, and capabilities. Replayed spawns upsert by child id.
_Avoid_: Child chat, nested session, sub-session

**Spawned subagent session**:
A Subagent session the Harness started on a parent's behalf when the parent's agent called the Hub's `spawn_subagent` tool, on any other usable agent launch target (never the parent's own: for its own provider the agent uses its native subagent tool). Unlike a native Subagent session it is a real session on its own launch target, started in the parent's session cwd and prompted with the Subagent task; but it is shown exactly like a native one (parent transcript item, Subagent view, Work state, its own Pending interactions) and is not listed as a History entry of its own while its parent is live. It reports back to the parent when its Prompt turn ends: as the tool result (foreground) or as a new message to the parent (background). Ends with its parent: cancelling the parent's Prompt turn cancels its foreground children; closing or deleting the parent closes them.
_Avoid_: Delegated session, child session

**Spawned subagent link**:
The Harness's memory-only record that a session on one launch target is a Spawned subagent session of a parent session, kept from spawn until the child or its parent ends and gone after a restart (replaying the parent then yields a Restored subagent, not a link). While it exists the child is hidden from Session History, is never swept by a workspace folder change, and has its Attention events named under its parent. Until its Prompt turn ends the child is a **live child** of the parent, and a parent may have only a fixed number of live children at once; a child cannot itself spawn.
_Avoid_: parent link (the parent recorded on a native Subagent session for turn tracing), subagent registration

**Subagent outcome**:
How a Spawned subagent session's Prompt turn ended: completed with its final agent message, failed with a cause, or cancelled. A turn that completes without any message counts as failed, so the parent's agent always gets something to act on. It reaches the parent's agent by one of two routes: as the result of the agent's own call (the foreground `spawn_subagent`, or `wait_subagent`), or as a Subagent report. A call that collects it before the Subagent report is sent suppresses the report; a Subagent report is never sent twice.
_Avoid_: Handoff (a different term), response

**Subagent result**:
The one text shape the Hub's `spawn_subagent` and `wait_subagent` tools hand back for a Spawned subagent session: a `<subagent …>` element naming the child (its id, Work state, launch target, name, applied Config option values and Subagent task) around its final agent message. A foreground `spawn_subagent` that finishes returns it too, so the agent always learns the child's id. It is the only durable trace of a Spawned subagent session in the parent's own transcript, so replay rebuilds the Restored subagent from it. A refusal (unknown target, empty task) is a plain error, not a Subagent result.
_Avoid_: Subagent outcome (how the turn ended, before it is worded for the agent), Subagent report (the message that arrives unasked)

**Restored subagent**:
A Spawned subagent session rebuilt read-only from a Subagent result when its parent's transcript is replayed (`session/load`) after the Spawned subagent link is gone. It shows as the same transcript row and opens the same Subagent view, but holds only what the result recorded: name, Provider, Model and Effort, Subagent task and final message; no live Pending interactions, no cancel. Its Work state is the one the result recorded; a child no result ever recorded as finished is shown with an unknown state. The Hub's generic `spawn_subagent` / `wait_subagent` tool-call rows fold into it and disappear; a session recorded before Subagent results carried this data keeps those generic rows. The child is also an ordinary Session History entry after a restart.
_Avoid_: historical subagent, ghost subagent

**Subagent report**:
The message the Harness sends a parent when a background Spawned subagent session's Prompt turn ends: names the child and its Subagent task, and carries the child's final agent message (or its failure). Delivered as Steering when the parent is mid-turn and Steering is supported, otherwise as a new Prompt turn once the parent is idle; dropped when the parent is gone.
_Avoid_: notification, callback

**Subagent view**:
The read-only, full-pane transcript of one Subagent session of the Selected session, shown in place of the Selected session's transcript and Composer. Opens with the Subagent task, then the transcript, and ends with a read-only dock that shows the child's Provider and, when known, its Model and Effort (a Spawned subagent session's Session configuration; a native one reports none, so only its Provider shows) as disabled Config chips beside a "Subagent session — read-only." note, with no editor or send controls. Shown only while that Subagent session still exists; otherwise the Selected session's transcript shows.
_Avoid_: child view, subagent page, viewed subagent (when you mean what is on screen)

**Subagent task**:
The instruction the parent gave a Subagent session at spawn (`task`). The child transcript has no user prompt of its own, so the Subagent view shows it first, as markdown. A `session/load` replays it as the child's first user message; that echo is hidden so the task shows once. Later subagent updates replace it or clear it; absent or blank, nothing is shown.
_Avoid_: prompt, child prompt

**Work state**:
A subagent's open-union state: `running`, `requires_action`, `idle`, `completed`, or an unknown string (rendered neutral). `completed` and `idle` both display as finished. Reset to unconfirmed on load, resume, or connection loss.

**Inter-session message**:
A directed message between sessions (`session_message` / `session_message_chunk`), upserted by `messageId` within its owning transcript. Shown with sender/recipient; never rendered as a user prompt or tool call.

**Sessions Page**:
The page of Session History grouped by Project with the Selected session's chat. The default page. While Experimental: Workstreams is on, it lists only sessions no Workstream owns.
_Avoid_: home page, main page

**Workstreams Page**:
The page that lists Workstreams with their sessions, beside the Selected session's chat. Exists only while Experimental: Workstreams is on; a page switcher beside the active page moves between it and the Sessions Page.
_Avoid_: Features page, Missions page

**Workstream**:
A named, user-created collection of sessions (across Projects and launch targets). A session belongs to at most one Workstream. Archiving a Workstream archives its sessions; deleting it Orphans them.
_Avoid_: Feature, Mission, group, folder

**Adopt**:
Move a session from the Sessions Page into a Workstream, which removes it from any other Workstream first.
_Avoid_: assign, add to group

**Orphan**:
Take a session out of its Workstream so it returns to the Sessions Page, under its cwd's Project.
_Avoid_: unassign, detach, remove

**Experimental: Workstreams**:
User setting `workstreamsEnabled` (off when unset). While on, the Workstreams Page and its page switcher exist and the Sessions Page lists only sessions no Workstream owns; while off, owned sessions show under their Project again and ownership persists. Changing it does not reactivate sessions.
_Avoid_: Features setting, Missions setting

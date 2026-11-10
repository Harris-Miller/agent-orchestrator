# ui

Shared Agent Harness webview context: Backend Harness behavior, Harness application state, and shared React surfaces (SettingsCategoryContent for General / Appearance / Providers panes, ThemeSelect, restore-defaults / load-failure chrome helpers, ACP backend mount, AppThemeProvider, PersistUserSettingsToast) consumed by the desktop app and VS Code webview. Both hosts use the router-independent SettingsShell with a permanent category drawer on wide windows and a temporary drawer on narrow windows.

Workspace-folder churn policy lives in `src/atoms/workspaceFolders.ts`; hosts provide folder paths and call its boot/change effects.

## Language

**Harness application state**:
The reactive Harness state shared across host webviews — backend harness phase, Selected union (Virtual | Session | unset), the optional Virtual session blob (may hold a Bound `sessionId`), last-create defaults, Lifecycle lock (Materialize only), sessions, chat, handoff, and User settings projections.
_Avoid_: App atoms, store, desktop atoms, Redux

**Composer**:
The draft editor for the Selected target: text and Composer Image Attachments, kept per Session or on the Virtual session, plus the one Composer action it offers. Stays editable during a prompt turn (Draft during turn); not editable while its Session is not active, while a Handoff runs, or while a Virtual Send is pending. An edit that finishes later (images from the Host FileDialog, an image Filesystem Mention, or an image path resolved from the draft) lands on the Composer it started on, never on the one Selected when it finishes, and is added to that Composer's attachments as they are when it finishes; if it started on the Virtual session and that session is being Materialized or no longer exists by then, the images are dropped.
_Avoid_: chat input, prompt box, input bar

**Composer action**:
What submitting the Composer does right now: Send, Steering (or Queue, by the `midTurnSend` User setting), Prompt turn cancel, or nothing, with the reason (empty draft, Pending client request, Send pending, Pending interaction, Session not active, Handoff running or Lifecycle lock held, Virtual session not ready). A running Handoff locks out only Send; Steering and Prompt turn cancel stay available. Decided once from the Selected target's state and the draft. The primary button shows it; Enter performs only Send, Steering or Queue, never Prompt turn cancel. The Harness refuses any Send or Steering the Composer action would not offer for that Session.
_Avoid_: primary button state, canSend, canSteer

**Draft during turn**:
Composer text and attachments the user keeps editing while a prompt turn is in flight. Never auto-sent: with Steering supported it can be sent as Steering or Queued (a Queued message); otherwise it stays in the Composer and is sent as a normal prompt after the turn ends. If Steering fails, the message goes back into that Session's Composer, ahead of anything typed since.
_Avoid_: Queued prompt, pending message, outbox

**Mid-turn send**:
What the Send button and Enter do while Steering is offered: Steering or Queue, by the `midTurnSend` User setting (Steering when unset). The Send options menu (the chevron next to Send) offers the other one for that message only (shown for Agents with Steering supported, disabled unless Steering is offered). Not offered when Steering is not supported.
_Avoid_: Send mode, queue mode

**Queued message**:
In the Composer: shown as one row above the editor with an Edit action that moves it back into the draft (defined in the desktop glossary; desktop ADR-0020).
_Avoid_: Queued prompt, outbox, Send pending

**Prompt turn**:
The Harness side of one ACP Turn the user starts on a Session, by Send or by Handoff: the user message with its turn timing, the Pending client request while the Turn runs, Steering into it, Prompt turn cancel of it, and an Attention event when it ends. Starts only when the Composer action's rule would offer Send for that Session (a running Handoff's own lock aside) and Bootstrap is `usable` (or `ready`); a refused start leaves the transcript as it was.
_Avoid_: request, generation, Turn (unqualified: the ACP cycle)

**Bind**:
Eager, optimistic `session/new` for the Virtual draft once absolute cwd, launch target, and Bootstrap `usable` (or `ready`) are known: sessions-map upsert + Bound id on the Virtual blob; not a History entry; no Config apply (Materialize alone applies Config). Selected stays Virtual. Never locks the composer or Config controls: the latest `{launch target, cwd}` wins, and a superseded Bind's session is torn down in the background. While Selected is Virtual, Config edits write only the Virtual blob (a Lazy hydrate pick also sets the model on the Bound session); the Bound session's Session configuration may differ until Materialize applies diffs. Triggers: creating or re-selecting the Virtual session, a launch target or cwd change, the provider becoming `usable`, and Send when none is in flight (draft, attachment, and Config edits never Bind). Distinct from Materialize (first-Send promote).
_Avoid_: Materialize, activate, session create (when you mean this Virtual-only step)

**Lifecycle lock**:
Short lock held only while a Virtual session Materializes (Config diffs + history upsert); Virtual edits and cwd/Config controls are inert while it is held. Bind never takes it. Released before the prompt is sent.
_Avoid_: Bind lock, in-flight lock

**Send pending**:
The span from pressing Send on a Virtual draft until Materialize finishes: the Send waits for the provider to be `usable` and for the latest Bind, then Materializes. Blocks double-submit and freezes only the draft text and attachments; the draft stays until Materialize succeeds, and a failure (provider `error`, Bind failure) leaves it in place.
_Avoid_: Queued send, outbox

**Leaving Virtual**:
Navigating off the Virtual session by Selecting a Session or clearing Selected. Never waits on Bind or the Lifecycle lock. With Composer content the Virtual blob and its Bound session are kept (an in-flight Bind or Materialize finishes in the background); with an empty Composer the blob is discarded and its Bound session torn down in the background. Distinct from discarding the Virtual session when the Workspace folder goes away, which drops it regardless of content.
_Avoid_: close Virtual, cancel draft, discard (when the Composer has content)

**Backend harness snapshot**:
The Harness application state for one launch target: Bootstrap phase and failure, initialize result and the Agent capabilities read from it, RPC wire log, Session History, Session snapshots, and Subagent sessions. Changes only by a Harness state transition or the Harness event fold applied to its latest value, never by writing back a copy read before a wait.
_Avoid_: backend state, harness state (unqualified), store

**Harness state transition**:
Pure fold that turns one Backend harness snapshot (and transition args) into the next legal snapshot — pending strip, inactive/drop, Session History replace, Materialize upsert, Config change and Prompt turn begin/end, a `session/set_config_option` response applied to a Session configuration. Callers (State Atoms, host churn, the Harness event fold) apply it to the latest snapshot; does not speak ACP or own Atom writes.
_Avoid_: reducer (when you mean this module), patchSession (map helper only), session update apply

**Harness event fold**:
The one consumer of what a Backend harness reports for its launch target (session updates, permission requests, elicitations, Bootstrap phases, Session History lists, Config option index publishes, Connection lost): folds each into the Backend harness snapshot and carries out its consequences — a Subagent session's parent recorded for turn-correlated tracing, Attention events for new Pending interactions, the `usable` Bind, the Connection lost unbind.
_Avoid_: harness callbacks, onSessionUpdate glue, event handler, reducer

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs initialize, seeds the Config option index (Config probe, cold cache only), then lists sessions after `usable`, and retries on failure. Each attempt holds at most one ACP Connection and ends it with Connection lost. One per mounted target; runs in parallel with siblings. Does not own the session transcript or the Backend harness snapshot: it reports to the Harness event fold.
_Avoid_: Connection, provider instance, worker, ACP client runtime (when you mean this host-owned program)

**Connection lost**:
The end of a Backend connection, by the user stopping the Provider (Stop) or by a failed bootstrap attempt. Every Session goes `inactive` with its pending interactions cancelled, Session History stays but is unavailable until the next list, and the Virtual session loses its Bound session while keeping its draft, launch target, and Config. Stop additionally drops the Virtual session's launch target and Config.
_Avoid_: disconnect, provider stopped, harness reset

**Backend connection**:
A Backend harness's live ACP Connection together with what lives exactly as long as it: in-flight Turn tracing, Subagent session parent links, and the Lazy hydrate route into the Config option index. At most one per launch target; ends with Connection lost.
_Avoid_: connected agent, Connection (unqualified)

**Agent capabilities**:
What the Harness may ask of a launch target's ACP Agent on the current Backend connection: Steering, image and embedded-context prompts, and Session close, fork, resume, archive and rename. Read once from the initialize result and narrowed per Provider where the advertisement is not yet trusted; none until initialize, and gone with Connection lost. What the Harness refuses or does best-effort without them is recorded in desktop ADR 0013.
_Avoid_: initialize result (the raw response), ACP `agentCapabilities` (the wire field: only part of what is read, and not narrowed), capability helpers, advertised capabilities (when a Provider narrows them)

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: connecting → initialized → (signing-in for Antigravity Sign in) → usable → ready, or error. `usable`: initialize (and Sign in) done, and a Config option index exists (cached, or seeded by Config probe), so session RPCs (Bind, Materialize, resume) work and the launch target is selectable. `ready`: session list has also published; the retry counter resets here. Client-side setup only — not an ACP Session or Turn.
_Avoid_: Status, connection state, phase atoms

**Sign in**:
User-gated Antigravity Google account flow (`oauth-personal` / ACP `authenticate`) from Providers or the session composer. Product verb; not Vendor CLI `login`. Classified from the ACP `auth_required` error (or our own sign-in timeout), never from message text.
_Avoid_: authenticate (wire), login, OAuth elicitation

**Plan file**:
The file a Claude `ExitPlanMode` tool call names (`rawInput.planFilePath`), surfaced as a link above the Composer (plain text where the host cannot open files). Codex plans arrive as markdown with no file.
_Avoid_: Plan (the ACP `plan` entries list)

**Provider**:
An agent backend the user can enable (Claude, Codex, Antigravity, Cursor), identified by its launch target. Has a user-controlled enabled preference, requirements (CLI on PATH, a Provider runtime) and a derived status.
_Avoid_: backend (the running process), agent

**Provider runtime**:
The downloaded program backing a Provider (see hoa-home _Provider runtime document_). Check for latest resolves the newest version without touching the running provider; Download fetches it in the background; Install switches the Active runtime (stopping the provider, bootstrapping once, then deleting superseded runtimes); Remove clears it.
_Avoid_: adapter resource tree, bundled adapter

**Managed provider**:
A Provider that has a Provider runtime (Claude, Codex, Antigravity). Cursor is not managed: it runs the Vendor CLI directly. Download, Install, Remove, and Check for latest apply only to managed providers.
_Avoid_: Managed ACP Agent (a spawn kind, Antigravity only), bundled provider

**Disabled**:
The user switched a Provider off: no running backend, hidden from pickers, runtime files kept.
_Avoid_: unavailable, stopped (process state)

**Unavailable**:
An enabled Provider that cannot launch (CLI not on PATH, no Active runtime, failed download). Stays visible in pickers as a disabled row with a reason.
_Avoid_: disabled, error (bootstrap phase)

**Node prerequisite**:
A global Node >= 22 and npm, checked at startup. The blocking Node modal (detected versions, Download Node.js, Retry) cannot be dismissed and ignores "Don't show me again".

**Startup Providers modal**:
The compact provider matrix shown on every launch while "Show Providers on startup" is on, after the Node prerequisite and settings load. Closing it never unmounts providers.

**Antigravity auth URL**:
OAuth URL from the capture-only `BROWSER` helper during Sign in — copyable in UI; Host OpenUrl opens it.
_Avoid_: elicitation URL

**Config option index**:
Per-launch-target index of default model, per-model selectable option rows, and Unavailable models. Hydrated from hoa-home cache before Backend Harnesses mount, seeded by Config probe when the cache is missing, then kept current and persisted by Lazy hydrate. Rows may be missing for models not yet selected.
_Avoid_: Provider catalog, harness defaults, config catalog

**Session configuration**:
The Config options of one Session as the agent last reported them, plus a Config change it has not answered yet; the selected model and mode are its `model` and `mode` options. Canonical definition in the desktop glossary.
_Avoid_: live Config, session/new result, Config option index (that is per launch target)

**Config change**:
A user's optimistic change to one Config option of an active Session, withdrawn if its request fails unless the agent has since reported a different value. Canonical definition in the desktop glossary.
_Avoid_: set config, config update (ambiguous with the agent's config option update)

**Config probe**:
Cold-cache seed of the Config option index, run before Bootstrap `usable`. Not an Active session; never Materialize. Canonical definition in the desktop glossary.
_Avoid_: Session create, materialize, activate

**Lazy hydrate**:
Keeping the Config option index current from live agent responses instead of probing every model. Canonical definition in the desktop glossary.
_Avoid_: refresh, re-probe

**Session History**:
Per-launch-target Harness view of `session/list`, hydrated from hoa-home before Backend Harnesses mount. Cached rows are unavailable until confirmed by a successful list; cwd-scoped refreshes preserve rows from other workspaces. Archived rows are cached. Browsing hides them unless Show archived is on (ADR-0008); Session History search includes them regardless of that toggle. Canonical definition in the desktop glossary.
_Avoid_: Roster, Session roster, Adapter history document, session snapshot

**Unavailable model**:
A model id advertised on `session/new` whose `session/set_config_option(model)` soft-failed when picked; kept visible in model selects as disabled `(unavailable)`, with no row. Cleared when a later pick succeeds.
_Avoid_: Missing model, failed model, disabled model (when you mean this outcome)

**Developer panel**:
Shared Harness UI debug surface (RPC wire log, Session State, Atoms, host-supplied extra tabs). Open preference and the open/close toggle are shared; hosts own pane layout chrome and host-only tabs. Its Atoms tab lists every Atom in the registry with its current value, shown in the form that fits the value's type.
_Avoid_: Devtools panel, debug drawer (when you mean this surface)

**Dev state bridge**:
Opt-in (a button in the Developer panel's Atoms tab), read-only access to the current value of every Atom in the registry for automation tools (Tauri MCP, Chrome DevTools MCP). Atoms are found by label; an Atom without one is named after the module export that holds it, else given an unstable `anonymous` id. Nothing is exposed or read until the user enables it.
_Avoid_: state dump, debug API, devtools hook

**Available Command**:
A session-advertised ACP command entry from `available_commands_update` (`name` + optional `description`), stored on the session snapshot for the Composer Menu and Command Chip matching.
_Avoid_: slash palette entry, skill definition (when you mean this list item)

**Composer Trigger**:
An in-progress `/`, `$`, or `@` token in the chat draft that opens a Composer Menu (agent-specific rules for where `/` and `$` may start; `@` is whitespace-bounded and opens from `@` alone).
_Avoid_: autocomplete, slash palette (when you mean the open-menu token)

**Markdown styling**:
The Composer's live view of Markdown in the draft: bold, italic, strikethrough, inline code, headings, quotes, lists, and fenced code are shown styled as they are typed or pasted. The draft text is unchanged and stays the only source; styling is derived from it, and Command Chips and Markdown Link Chips are never restyled.
_Avoid_: rich text, WYSIWYG, formatting (when you mean this view), Markdown mode

**Marker reveal**:
Markdown styling shows an inline Markdown marker (`**`, `*`, `~~`, `` ` ``) only while the caret is inside that span. Line-leading markers (`#`, `>`, bullets) never show; Backspace at the start of such a line's content removes the marker. Ordered-list numbers and fence lines always show.
_Avoid_: source mode, marker toggle

**Composer Menu**:
The floating list opened by a Composer Trigger — Available Commands for `/` and `$`, or filesystem paths for `@`. Choosing an item replaces the Composer Trigger under the caret; if the caret is no longer in a matching Trigger, choosing only closes the menu.
_Avoid_: autocomplete, slash palette, picker (when you mean this list)

**Filesystem Mention**:
Choosing a filesystem path from the `@` Composer Menu; the draft receives a markdown link that displays as a Markdown Link Chip (not a separate chip kind). Choosing an image file instead removes the Trigger and adds the image as a Composer Image Attachment. Recursive `@` listing (and the New Session shallow directory picker) always exclude `.git` and honor Always-hidden globs from User settings; Show hidden does not override those excludes. See `@lib/hoa-home` Always-hidden glob.
_Avoid_: mention chip, file chip, @ chip (when you mean this selection act or its resulting Markdown Link Chip)

**Command Chip**:
A display pill for a completed invocation token (`/name` or `$name`) that exact-matches a current Available Command. Label stays the raw invocation (no leading kind glyph). In the composer it is a Lexical decorator; in user transcript bubbles it is an inert span. Commands remain plain text in the draft, in stored user-message text, and in `session/prompt` text segments; chips re-evaluate against the current Available Commands list.
_Avoid_: Markdown Link Chip, skill pill, autocomplete token, mention chip (when you mean this pill)

**Markdown Link Chip**:
A display pill whose underlying text is a markdown link `[label](href)` (filesystem path or URL); shows the label only and may show a leading file-type or link glyph. In the composer it is a Lexical decorator; in user transcript bubbles it is a span that follows the Chat Markdown Link click rules. The draft/transcript markdown string is the source of truth; on send, filesystem links become ACP ContentBlocks while non-filesystem links stay inside text segments. A Filesystem Mention is one way such a link enters the draft.
_Avoid_: Command Chip, mention chip, hyperlink (when you mean this pill)

**Chat Markdown Link**:
Inline link in rendered chat markdown from agent text, thoughts, or tool results. Only `http(s)` and Host-supported `file://` or workspace-path links are clickable; clicks never navigate the webview. Transcript Markdown Link Chips (user `resource` / `resource_link` prompts) follow the same rules. Scheme-less workspace paths resolve against the session cwd.

**Wait tool call**:
An agent tool call with ACP kind `other` and title exactly `wait`. Never shown in chat; it stays in the transcript. Any other `other` call, or a `wait` of another kind, is shown normally.
_Avoid_: waiting call, sleep call

**Composer Image Attachment**:
A draft-side image added from the Host FileDialog, by an image Filesystem Mention, or from an `@path` or file link in the draft that resolves to an image file; held in-memory as metadata plus a base64 data URL from the read bytes (preview only — no thumbnail processing). On `session/prompt`, when the Agent advertises `promptCapabilities.image`, it is sent as an ACP Image ContentBlock (`data` + `mimeType` + `uri`); otherwise as a baseline `type: "resource_link"` (not UI-gated, not `embeddedContext`). Transcript keeps slim refs (mime/name/uri/preview data URL); after `session/load` / `user_message_chunk`, image-like `resource_link`s, ACP `type: "image"` blocks, `file://` image markdown links, or allowlisted `data:image/…;base64,…` markdown links lift into those refs (inline data / image blocks keep the preview; `file://` hydrates when possible).
_Avoid_: embedded resource, clipboard image, paste/drop attach (follow-ups)

**Attention event**:
A moment the user should notice in any session (not only the Selected one): a Prompt turn ending with any stop reason except `cancelled` (Handoff's Prompt turns included), a new Pending permission, or a new Pending elicitation. RPC errors are not Attention events. Each raises a Notification (title = session chat title, or `Chat` before the session has a history entry; fixed body phrase) subject to the Notifications, Notification sound, and Only-notify-when-unfocused User settings.
_Avoid_: alert, ping, completion event

**Keep-awake hold**:
The Harness's OS idle-sleep hold, kept while any Prompt turn on any launch target is working (in flight with no Pending interaction on its Session or its Subagent sessions) and released a short grace period after none is, or at once when the Keep awake User setting is off. Never prevents display sleep or an explicit or lid-close sleep, and ends with the Harness process.
_Avoid_: sleep inhibitor, caffeinate, wake lock, keep-alive

**Copy message**:
The control under a transcript user or agent message that writes that message's Markdown source to the Host clipboard. For user messages, Command Chips copy as the raw invocation and Markdown Link Chips as `[label](href)`; injected context blocks and images are omitted. Does not apply to thoughts or tool output, and is distinct from the selection copy inside a user bubble.
_Avoid_: copy button (when you mean the behavior), copy rendered text

For Host services and BundledResource / Clipboard / FileDialog vocabulary, see [`../context-services/GLOSSARY.md`](../context-services/GLOSSARY.md). Session and Settings domain terms live primarily in [`../../apps/desktop/GLOSSARY.md`](../../apps/desktop/GLOSSARY.md). VS Code sidebar view terms (Workspace folder, Workspace cwd, Session History, Chat) live in [`../../apps/vscode/GLOSSARY.md`](../../apps/vscode/GLOSSARY.md). Shared session transcript/composer React lives in this package for both host apps to route or wrap.

**Session History search**:
A search by Session title within the host’s Session History scope that includes archived and unarchived entries regardless of Show archived. Results list all unarchived matches before archived matches, with text relevance ordering within each group.

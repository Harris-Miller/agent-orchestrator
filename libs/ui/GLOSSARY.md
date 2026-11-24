# ui

Shared Agent Harness webview context: Backend Harness behavior, Harness application state, and shared React surfaces (SettingsCategoryContent for General / Appearance / Providers panes, ThemeSelect, restore-defaults / load-failure chrome helpers, ACP backend mount, AppThemeProvider, PersistUserSettingsToast) consumed by the desktop app and VS Code webview. Both hosts use the router-independent SettingsShell with a permanent category drawer on wide windows and a temporary drawer on narrow windows.

Workspace-folder churn policy lives in `src/atoms/workspaceFolders.ts`; hosts provide folder paths and call its boot/change effects.

## Language

**Harness shell**:
The boot order both hosts run: user settings load, the fd and Node prerequisite gates, Provider bootstrap, then (VS Code only) Workspace folders, then caches hydrate and the Backend harnesses mount. Hosts compose its two parts (prerequisites, then mounts) and add only what differs — layout, routing, VS Code's Workspace folders step, the desktop's own dialogs; they never assemble the gates or mounts one by one. A Backend harness never mounts before its caches have hydrated.
_Avoid_: app shell, root layout (when you mean this boot order)

**Analytics event catalog**:
The closed list of Analytics events the app can capture: one builder per event, each with its own allowlisted primitive properties, none carrying free text or Private data. A user action captures its event only when it succeeds. See root ADR 0004 and the context-services term "Analytics event".
_Avoid_: tracking call, free-form event, telemetry event

**Harness application state**:
The reactive Harness state shared across host webviews — backend harness phase, Selected union (Virtual | Session | unset), the optional Virtual session blob (may hold a Bound `sessionId`), last-create defaults, Lifecycle lock (Materialize only), sessions, chat, handoff, and User settings projections.
_Avoid_: App atoms, store, desktop atoms, Redux

**Composer**:
The draft editor for the Selected target: text and Composer Image Attachments, kept per Session or on the Virtual session, plus the one Composer action it offers. Stays editable during a prompt turn (Draft during turn); not editable while its Session is not active, while a Handoff runs, or while a Virtual Send is pending. An edit that finishes later (images from the Host FileDialog, an image Filesystem Mention, or an image path resolved from the draft) lands on the Composer it started on, never on the one Selected when it finishes, and is added to that Composer's attachments as they are when it finishes; if it started on the Virtual session and that session is being Materialized or no longer exists by then, the images are dropped.
_Avoid_: chat input, prompt box, input bar

**Composer action**:
What submitting the Composer does right now: Send, Steering (or Queue, by the `midTurnSend` User setting), Prompt turn cancel, or nothing, with the reason (empty draft, Pending client request, Send pending, Pending interaction, Session not active, Handoff running or Lifecycle lock held, Virtual session not ready). A running Handoff locks out only Send; Steering and Prompt turn cancel stay available. Decided once from the Selected target's state and the draft. The primary button shows it. With an empty draft, no Prompt turn and a Background follow-up running, Prompt turn cancel is offered (the button shows Stop), even with a Pending interaction (the cancel resolves it); with content it is still Send, or unavailable while an interaction is pending. Enter performs only Send, Steering or Queue, never Prompt turn cancel. The Harness refuses any Send or Steering the Composer action would not offer for that Session.
_Avoid_: primary button state, canSend, canSteer

**Draft during turn**:
Composer text and attachments the user keeps editing while a prompt turn is in flight. Never auto-sent: with Steering supported it can be sent as Steering or Queued (a Queued message); otherwise it stays in the Composer and is sent as a normal prompt after the turn ends. If Steering fails, the message goes back into that Session's Composer, ahead of anything typed since.
_Avoid_: Queued prompt, pending message, outbox

**Mid-turn send**:
What the Send button and Enter do while Steering is offered: Steering or Queue, by the `midTurnSend` User setting (Steering when unset). A small outlined button beside Send, labelled with the other one, sends that message the other way (shown only while Steering is offered). Not offered when Steering is not supported.
_Avoid_: Send mode, queue mode

**Session actions strip**:
The strip above the Composer: the host's cwd control (or a read-only cwd label) on the left, Fork and Handoff icon buttons on the right. Always shown; Fork and Handoff are disabled with a tooltip reason when unavailable, and hidden for a Virtual session. Handoff is also hidden while the User setting `appOrchestratedAgentsEnabled` is off.
_Avoid_: Send options menu, toolbar

**Queued message**:
In the Composer: shown as one row above the editor with an Edit action that moves it back into the draft (defined in the desktop glossary; desktop ADR-0020).
_Avoid_: Queued prompt, outbox, Send pending

**Subagent row**:
One Subagent in a list: status, provider icon, name, Model · Effort, and its latest activity, shown the same for a live child and a Restored subagent. Opens the Subagent view on click; pinned under a collapsed Work region's header (and kept there after the Subagent finishes), and shown in its normal position once the region is expanded.
A list entry for a Subagent, not a Chat item (the transcript unit).
_Avoid_: Subagent card, Subagent item

**Background follow-up**:
A Session's autonomous Work after its Prompt turn ended while a Subagent session still runs (a native one: Claude, AIR `backgroundSubagents`): the Session is active with no Pending client request and a Subagent descendant of either kind, at any depth, is `running` or `requires_action`. The Agent may raise Pending interactions during it. Counts as working for the Work region and the Keep-awake hold; Prompt turn cancel with no turn cancels the Pending interactions and the agent.

**Prompt turn**:
The Harness side of one ACP Turn the user starts on a Session, by Send or by Handoff: the user message with its turn timing, the Pending client request while the Turn runs, Steering into it, Prompt turn cancel of it, and an Attention event when it ends. Starts only when the Composer action's rule would offer Send for that Session (a running Handoff's own lock aside) and Bootstrap is `usable` (or `ready`); a refused start leaves the transcript as it was. It ends with the Agent's stop reason, or with a Request error when the Agent answers the prompt with an error response; either way the user message stays.
_Avoid_: request, generation, Turn (unqualified: the ACP cycle)

**Request error**:
The Agent's error response (code, message, and its own details when it gives them) to a request the user made from a Session's chat, shown in that chat, not as a toast. It is a valid answer, not a failure of the Harness: the Prompt turn ends, a Steering message is not delivered and goes back into the Composer, a Config change is reverted. A Handoff step answered this way fails the Handoff with the Agent's message. Anything else that fails (no Backend connection, transport, activation, managing a Session in History) is not a Request error and reaches the user as a readable message in the host's error toast.
_Avoid_: toast error, RPC failure, client error

**Retry**:
The Session failure action that re-sends the user's last message as a new Prompt turn on the same Session. Offered for failures other than usage-limit ones (which offer Continue instead). Distinct from `session/resume` (reattaches a Session, never restarts a turn).
_Avoid_: resume

**Continue**:
The Session failure action shown on a usage-limit (`limit`) failure that offers retry. It starts a new Prompt turn on the same Session with the fixed text "Continue where you left off." as an ordinary user message, without needing a re-sendable last user message. Distinct from Retry (for other failures) and from `session/resume` (reattaches a Session, never restarts a turn).
_Avoid_: resume

**Session failure**:
An error or warning the Agent itself reports about a Session as a typed record (a stable id, a revision, a severity, a title, optional details and reason, and the follow-up actions it offers), when the Harness has offered to receive them. Shown as one row in that Session's chat per id: a later report with a higher revision replaces the row's content (a retry counting "attempt 2 of 5"), an equal or lower revision changes nothing. It may end a Prompt turn the Agent answered normally, or report something outside any turn (a notice, a background incident). Distinct from a Request error: that is a JSON-RPC error response, this is the Agent's own account of what went wrong. An Agent that cannot sign the user in still answers with `auth_required`, which is not a Session failure. The user sees only the actions the Harness knows how to run (retry, new session, login); any other the Agent lists is ignored, and none is inferred from the failure's category. A usage-limit failure's retry is presented as Continue rather than Retry.
_Avoid_: error row, warning text, incident (the Agent's own word for one kind)

**Bind**:
Eager, optimistic `session/new` for the Virtual draft once absolute cwd, launch target, and Bootstrap `usable` (or `ready`) are known: sessions-map upsert + Bound id on the Virtual blob; not a History entry; no Config apply (Materialize alone applies Config). Selected stays Virtual. Never locks the composer or Config controls: the latest `{launch target, cwd}` wins, and a superseded Bind's session is torn down in the background. While Selected is Virtual, Config edits write only the Virtual blob (a Lazy hydrate pick also sets the model on the Bound session); the Bound session's Session configuration may differ until Materialize applies diffs. Triggers: creating or re-selecting the Virtual session, a launch target or cwd change, the provider becoming `usable`, and Send when none is in flight (draft, attachment, and Config edits never Bind). Distinct from Materialize (first-Send promote).
_Avoid_: Materialize, activate, session create (when you mean this Virtual-only step)

**Lifecycle lock**:
Short lock held only while a Virtual session Materializes (Config diffs + history upsert); Virtual edits and cwd/Config controls are inert while it is held. Bind never takes it. Released before the prompt is sent.
_Avoid_: Bind lock, in-flight lock

**Send pending**:
The span from pressing Send on a Virtual draft until Materialize finishes: the Send waits for the provider to be `usable`, for the latest Bind (never an obsolete one or its cleanup), and for a pending Lazy hydrate pick on the same target, then Materializes. Blocks double-submit and freezes only the draft text and attachments; the draft stays until Materialize succeeds, and a failure (provider `error`, Bind failure, Connection lost during Materialize) leaves it in place.
_Avoid_: Queued send, outbox

**Leaving Virtual**:
Navigating off the Virtual session by Selecting a Session or clearing Selected. Never waits on Bind or the Lifecycle lock. With Composer content the Virtual blob and its Bound session are kept (an in-flight Bind or Materialize finishes in the background); with an empty Composer the blob is discarded and its Bound session torn down in the background. Distinct from discarding the Virtual session when the Workspace folder goes away, which drops it regardless of content.
_Avoid_: close Virtual, cancel draft, discard (when the Composer has content)

**RPC wire log**:
Every ACP message sent or received for one launch target, in order, for the Developer panel. Kept apart from the Backend harness snapshot so debug traffic never changes the state the Harness decides from. Survives Connection lost (a retry's messages follow the failed attempt's); only a provider stop (Stop, and the restarts built on it) clears it. A failed activation surfaces the agent's own error data from it.
_Avoid_: rpcCalls, wire trace, message log

**Backend harness snapshot**:
The Harness application state for one launch target: Bootstrap phase and failure, initialize result and the Agent capabilities read from it, Session History (its Tracked sessions), Session snapshots, and Subagent sessions. Excludes the RPC wire log. Changes only by a Harness state transition or the Harness event fold applied to its latest value, never by writing back a copy read before a wait.
_Avoid_: backend state, harness state (unqualified), store

**Harness state transition**:
Pure fold that turns one Backend harness snapshot (and transition args) into the next legal snapshot, and the only place that next value is computed: pending strip, inactive/drop, Session History replace, Materialize and Bind upsert, activation (begin, load/resume or unarchive failure, finish), Config change and Prompt turn begin/end/cancel, Steering injected, a pending permission or elicitation answered, Bootstrap phase, a `session/set_config_option` response applied to a Session configuration, a live `session/update` (routed to its Session or Subagent session, restoring the Subagents its Subagent results name), and Connection lost. Callers (State Atoms, host churn, the Harness event fold) apply it to the latest snapshot and hold no snapshot spreads of their own; does not speak ACP or own Atom writes.
_Avoid_: reducer (when you mean this module), patchSession (map helper only), session update apply

**Harness event fold**:
The one consumer of what a Backend harness reports for its launch target (session updates, permission requests, elicitations, Bootstrap phases, Config option index publishes, Connection lost): folds each into the Backend harness snapshot (every ACP message also goes to the RPC wire log) and carries out its consequences — a Subagent session's parent recorded for turn-correlated tracing, Attention events for new Pending interactions, the `usable` Bind, the Connection lost unbind.
_Avoid_: harness callbacks, onSessionUpdate glue, event handler, reducer

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs initialize, seeds the Config option index (Config probe, cold cache only), then reports `ready` (it never lists sessions: `session/list` runs only from Import), and retries on failure. Each attempt holds at most one ACP Connection and ends it with Connection lost. One per mounted target; runs in parallel with siblings. Does not own the session transcript or the Backend harness snapshot: it reports to the Harness event fold.
_Avoid_: Connection, provider instance, worker, ACP client runtime (when you mean this host-owned program)

**Connection lost**:
The end of a Backend connection, by the user stopping the Provider (Stop) or by a failed bootstrap attempt. Every Session goes `inactive` with its pending interactions cancelled, Session History stays but is unavailable until the next connection, and the Virtual session loses its Bound session while keeping its draft, launch target, and Config. Stop additionally drops the Virtual session's launch target and Config.
_Avoid_: disconnect, provider stopped, harness reset

**Backend connection**:
A Backend harness's live ACP Connection together with what lives exactly as long as it: in-flight Turn tracing, Subagent session parent links, and the Lazy hydrate route into the Config option index. At most one per launch target; ends with Connection lost.
_Avoid_: connected agent, Connection (unqualified)

**Agent capabilities**:
What the Harness may ask of a launch target's ACP Agent on the current Backend connection: Steering, image and embedded-context prompts, and Session close, fork, resume, archive and rename. Read once from the initialize result and narrowed per Provider where the advertisement is not yet trusted; none until initialize, and gone with Connection lost. What the Harness refuses or does best-effort without them is recorded in desktop ADR 0013.
_Avoid_: initialize result (the raw response), ACP `agentCapabilities` (the wire field: only part of what is read, and not narrowed), capability helpers, advertised capabilities (when a Provider narrows them)

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: connecting → initialized → (signing-in for Antigravity Sign in) → usable → ready, or error. `usable`: initialize (and Sign in) done, and a Config option index exists (cached, or seeded by Config probe), so session RPCs (Bind, Materialize, resume) work and the launch target is selectable. `ready`: the backend is fully online; it does NOT wait for per-Project session lists (those run after `usable`, see Project list completeness). The retry counter resets here. Client-side setup only — not an ACP Session or Turn.
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

**Provider update check**:
A background Check for latest run after Provider bootstrap and every 6 hours for enabled managed Providers with an Active runtime. Notifies at most once per Provider version per launch, linking to Settings > Providers; never downloads or installs.
_Avoid_: auto-update

**Managed provider**:
A Provider that has a Provider runtime (Claude, Codex, Antigravity). Cursor is not managed: it runs the Vendor CLI directly. Download, Install, Remove, and Check for latest apply only to managed providers.
_Avoid_: Managed ACP Agent (a spawn kind, Antigravity only), bundled provider

**Disabled**:
The user switched a Provider off: no running backend, hidden from pickers, runtime files kept.
_Avoid_: unavailable, stopped (process state)

**Launch target availability**:
For each enabled launch target, whether the user can pick it now or the reason it cannot. Where both the Provider (**Unavailable**) and its Backend harness (still starting, models not loaded, bootstrap failed) give a reason, the Provider's is shown.
_Avoid_: picker state

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
Keeping the Config option index current from live agent responses instead of probing every model. Canonical definition in the desktop glossary. On a Virtual draft a pick lands on the target it started on only: a launch target, cwd or blob change meanwhile discards the draft write.
_Avoid_: refresh, re-probe

**Session History**:
Per-launch-target Harness view of the Tracked sessions (desktop glossary) for the Listed cwds, hydrated from hoa-home before Backend Harnesses mount. A row enters it when its session is created in-app or an Import is confirmed, and leaves it only by Delete or Stop tracking (which keeps its record dormant). Archived rows are kept. Each row also carries the Agent's row metadata as it was when tracked (Last prompt time as the order key; Activity state, model, cost and Fork source are only in the Developer panel's Session State tab; desktop glossary); title and Last prompt time then update only from live signals for loaded sessions. Browsing hides archived rows unless Show archived is on (ADR-0008); Session History search includes them regardless of that toggle. Canonical definition in the desktop glossary.
_Avoid_: Roster, Session roster, session snapshot

**Listed cwds**:
The cwds whose Tracked sessions this host shows: every Project on desktop, the Workspace cwd in VS Code.
_Avoid_: scope cwds, visible cwds

**Tracked sessions store**:
The on-disk record of a launch target's Tracked sessions, hydrated for the Listed cwds at startup and when a Project is added. hoa-home calls the document it lives in the Tracked sessions document.
_Avoid_: session cache, session index, history file

**Unavailable model**:
A model id advertised on `session/new` whose `session/set_config_option(model)` soft-failed when picked; kept visible in model selects as disabled `(unavailable)`, with no row. Cleared when a later pick succeeds.
_Avoid_: Missing model, failed model, disabled model (when you mean this outcome)

**Hidden model**:
A model the user turned off for one launch target in Settings > Providers, so model selects (Composer, Handoff target) omit it, except while it is the select's current value. Never chosen as a Starting model while another model is shown. When every usable (non-Unavailable) advertised model is hidden, hiding is ignored: selects list all of them and the Starting model is the agent's default. User settings only; never changes the Config option index, Session configuration, or what the agent reports. Not an Unavailable model. The Composer's model picker does not drop Hidden models but tucks them behind "Show more (N)" / "Hide more" at the bottom of the list, and its search matches Hidden and unhidden models alike, unhidden first.
_Avoid_: Disabled model, filtered model, blocked model

**Options section**:
The always-visible part of the Composer's model picker listing every Config option the agent advertises except mode, model and effort, one label + control row each, with no collapsed sub-menu, so options a provider adds later appear without a Composer change. Claude Ultracode is always its first row, disabled with a reason when the provider does not advertise it. Codex Ultra is not an option: it is an ordinary choice in the Reasoning list.
_Avoid_: Advanced, more options

**Well-known Config option**:
A Config option the Composer treats specially, identified by launch target and option id. Codex `collaboration_mode` renders as a "Plan" switch while its choices are just `default` and `plan` (a dropdown if it ever has more); Claude `fast` and Codex `fast-mode` / `fast_mode` render as boolean switches and add "Fast" to the model chip when on. These are always shown for their provider, disabled with "Not available for this model" while the session's Config options omit them (for example after a model or reasoning change). Every other option gets the generic control for its type (select or boolean).
_Avoid_: special option, custom option

**Starting model**:
The model a new Virtual draft or Handoff target begins on when nothing the user chose applies (no last-create default for that launch target, or that default names a Hidden or Unavailable model): the agent's default model if shown, else the first shown model in Model order. Unavailable models are never picked. A model the user already chose (a Session's current model, a Virtual draft's value, a Handoff form's value) is applied as-is even if it is later hidden: hiding changes what is offered, never what a Session already has.
_Avoid_: Default model (that is the agent's own, in the Config option index), fallback model

**Model order**:
The user's ordering of one launch target's advertised models, set in Settings > Providers and used by every model select. Models it does not list follow it in the agent's own order. Hidden models keep their place in it. A model that newly appears in an advertised list (not in the previous one) is added to the top and shown, not Hidden; the first probe reorders nothing.
_Avoid_: Model ranking, model priority, favorites

**Developer panel**:
Shared Harness UI debug surface (RPC wire log, Session State, Atoms, host-supplied extra tabs). Open preference and the open/close toggle are shared; hosts own pane layout chrome and host-only tabs. Its Atoms tab lists every Atom in the registry with its current value, shown in the form that fits the value's type.
_Avoid_: Devtools panel, debug drawer (when you mean this surface)

**Dev state bridge**:
Opt-in (a button in the Developer panel's Atoms tab), read-only access to the current value of every Atom in the registry for automation tools (Tauri MCP, Chrome DevTools MCP). Atoms are found by label; an Atom without one is named after the module export that holds it, else it is internal plumbing (given an unstable `anonymous` id) and hidden by default. Nothing is exposed or read until the user enables it.
_Avoid_: state dump, debug API, devtools hook

**Available Command**:
A session-advertised ACP command entry from `available_commands_update` (`name`, optional `description`, and whether it is a Skill), stored on the session snapshot for the Composer Menu and Command Chip matching.
_Avoid_: slash palette entry, skill definition (when you mean this list item)

**Skill**:
An Available Command the Agent identifies as a skill. The `$` Composer Trigger lists Skills for every Provider and inserts that Provider's native invocation (`/name` for Claude, `$name` for Codex). A Skill's chip is just a Command Chip.
_Avoid_: skill definition, skill pill

**Composer Trigger**:
An in-progress `/`, `$`, or `@` token in the chat draft that opens a Composer Menu (`/`, `$` and `@` are whitespace-bounded for every Provider; Codex Commands only run at draft start, so a later `/` lists Skills only; `@` opens from `@` alone).
_Avoid_: autocomplete, slash palette (when you mean the open-menu token)

**Markdown styling**:
The Composer's live view of Markdown in the draft: bold, italic, strikethrough, inline code, headings, quotes, lists, and fenced code are shown styled as they are typed or pasted. The draft text is unchanged and stays the only source; styling is derived from it, and Command Chips and Markdown Link Chips are never restyled. A quote shows a bar beside every visual line of its text, including lines its text wraps to.
_Avoid_: rich text, WYSIWYG, formatting (when you mean this view), Markdown mode

**Marker reveal**:
Markdown styling shows an inline Markdown marker (`**`, `*`, `~~`, `` ` ``) only while the caret is inside that span. Line-leading markers (`#`, `>`, bullets) never show; Backspace at the start of such a line's content removes the marker. Ordered-list numbers and fence lines always show.
_Avoid_: source mode, marker toggle

**Composer Menu**:
The floating list opened by a Composer Trigger — all Available Commands (including Skills) for `/`, only Skills for `$` (a `$` Trigger with no matching Skill shows no menu), or filesystem paths for `@`. Choosing an item replaces the Composer Trigger under the caret; if the caret is no longer in a matching Trigger, choosing only closes the menu.
_Avoid_: autocomplete, slash palette, picker (when you mean this list)

**Filesystem Mention**:
Choosing a filesystem path from the `@` Composer Menu; the draft receives a markdown link that displays as a Markdown Link Chip (not a separate chip kind). Choosing an image file instead removes the Trigger and adds the image as a Composer Image Attachment. Recursive `@` listing (and the New Session shallow directory picker) always exclude `.git` and honor Always-hidden globs from User settings; Show hidden does not override those excludes. The recursive `@` listing is preloaded when the session becomes the Selected active session and rescanned each time the `@` Composer Menu opens, with the previous entries shown until the rescan finishes. See `@lib/hoa-home` Always-hidden glob.
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

**Image Lightbox**:
A large dialog that shows the one image the user clicked (a Composer Image Attachment thumbnail or a transcript image thumbnail), with zoom and pan by mouse and zoom in / zoom out / reset buttons, its only action is Close (Esc and backdrop click also close it). Shown only where the Host cannot open the image itself (OpenFile unsupported, i.e. desktop); a Host that supports OpenFile opens the image in its own viewer instead. Never a gallery: it has no previous/next and shows no other images of the message or draft. A transcript thumbnail whose file cannot be read shows a broken-image placeholder and does not open it.
_Avoid_: image viewer, carousel, gallery, preview pane

**Attention event**:
A moment the user should notice in any session (not only the Selected one): a Prompt turn ending with any stop reason except `cancelled` (Handoff's Prompt turns included), a new Pending permission, or a new Pending elicitation. RPC errors are not Attention events. Each raises a Notification (title = session chat title, or `Chat` before the session has a history entry; fixed body phrase) and/or a Notification sound, subject to the Notifications, Notification sound, and Only-notify-when-unfocused User settings.
_Avoid_: alert, ping, completion event

**Keep-awake hold**:
The Harness's OS idle-sleep hold, kept while any Prompt turn or Background follow-up on any launch target is working (in flight, or running on its own, with no Pending interaction on its Session or its Subagent sessions) and released a short grace period after none is, or at once when the Keep awake User setting is off. Never prevents display sleep or an explicit or lid-close sleep, and ends with the Harness process.
_Avoid_: sleep inhibitor, caffeinate, wake lock, keep-alive

**Idle session sweep**:
The Harness's periodic pass that closes every active Session on a launch target that advertises Session close, has no Prompt turn or Background follow-up (a Spawned subagent's included), is not Selected, and has been idle longer than the Idle threshold; skipped while a Handoff runs. A closed Session is re-activated by Selecting it, as after a manual close.
_Avoid_: auto-archive, timeout, expire, reaper

**Idle threshold**:
How long a Session must have been without activity before the Idle session sweep may close it.
_Avoid_: archive timeout, expiry, TTL

**Copy message**:
The control under a transcript user or agent message that writes that message's Markdown source to the Host clipboard. For user messages, Command Chips copy as the raw invocation and Markdown Link Chips as `[label](href)`; injected context blocks and images are omitted. Does not apply to thoughts or tool output, and is distinct from the selection copy inside a user bubble.
_Avoid_: copy button (when you mean the behavior), copy rendered text

For Host services and BundledResource / Clipboard / FileDialog vocabulary, see [`../context-services/GLOSSARY.md`](../context-services/GLOSSARY.md). Session and Settings domain terms live primarily in [`../../apps/desktop/GLOSSARY.md`](../../apps/desktop/GLOSSARY.md). VS Code sidebar view terms (Workspace folder, Workspace cwd, Session History, Chat) live in [`../../apps/vscode/GLOSSARY.md`](../../apps/vscode/GLOSSARY.md). Shared session transcript/composer React lives in this package for both host apps to route or wrap.

**Host theme**:
The colors and font a Host reads from its own app and hands to the shared UI; only the VS Code webview supplies one, read from the active VS Code color theme. Each color tries a short chain of VS Code variables; when none is set it falls back to Original (dark theme kinds) or Catppuccin Latte (light and high-contrast-light kinds), or is derived from the colors that are set.
_Avoid_: VS Code theme id, custom theme

**Match VS Code theme**:
The User setting (`matchVscodeTheme`, on when unset) that makes the Harness UI use the Host theme instead of the Theme preference, following the VS Code color theme live. Offered only where a Host theme exists, so desktop never shows it and ignores the setting. The Theme preference is disabled while it is on, and still picks the file-icon set.
_Avoid_: VS Code theme preference, sync theme, follow VS Code

**Chat width**:
The User setting (`chatWidth`, Comfortable when unset) that caps the Chat transcript and Composer column at the `md` breakpoint (Comfortable), the `lg` breakpoint (Wide), or the full pane (Full). The transcript scrollbar stays at the pane edge.
_Avoid_: layout width, content width

**Session History search**:
A search by Session title within the host’s Session History scope (Tracked sessions only) that includes archived and unarchived entries regardless of Show archived. Results list all unarchived matches before archived matches, with text relevance ordering within each group.

**Import**:
The in-panel mode of Session History (not a route), opened from a Project's `⋯` menu on desktop or the Session History header in VS Code, scoped to one cwd. The only place `session/list` runs: one merged list of the cwd's untracked sessions across usable launch targets, newest Last prompt time first. Confirming a selected row loads it; only on success does it become a Tracked session and get Selected.
_Avoid_: sync, reload sessions, refresh

**Workstream-owned session**:
A session some Workstream owns. While Experimental: Workstreams is on it is left out of the Sessions Page lists and search; while off, ownership is kept but ignored and the session shows under its Project.
_Avoid_: hidden session, grouped session

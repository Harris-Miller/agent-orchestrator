# ui

Shared Agent Harness webview context: Backend Harness behavior, Harness application state, and shared React surfaces (SettingsCategoryContent for General / Appearance / Providers panes, ThemeSelect, restore-defaults / load-failure chrome helpers, ACP backend mount, AppThemeProvider, PersistUserSettingsToast) consumed by the desktop app and VS Code webview. Host apps still own host-specific Settings shell chrome (desktop category rail vs vscode list→detail).

Workspace-folder churn policy lives in `src/atoms/workspaceFolders.ts`; hosts provide folder paths and call its boot/change effects.

## Language

**Harness application state**:
The reactive Harness state shared across host webviews — backend harness phase, Selected union (Virtual | Session | unset), the optional Virtual session blob (may hold a Bound `sessionId`), last-create defaults, virtual lifecycle in-flight lock (Bind or Materialize), sessions, chat, handoff, and User settings projections.
_Avoid_: App atoms, store, desktop atoms, Redux

**Draft during turn**:
Composer text and attachments the user keeps editing while a prompt turn is in flight. Never auto-sent: with Steering supported it can be sent as Steering; otherwise it stays in the Composer and is sent as a normal prompt after the turn ends.
_Avoid_: Queued prompt, pending message, outbox

**Bind**:
Eager `session/new` for the Virtual draft once absolute cwd, launch target, and Bootstrap `usable` (or `ready`) are known: sessions-map upsert + Bound id on the Virtual blob; not a History entry; no Config apply (Materialize alone applies Config). Selected stays Virtual. While Selected is Virtual, Config changes write only the Virtual blob; the Bound session's live Config may differ until Materialize applies diffs. Sole triggers: post-mutate rebind and the `usable` `onPhase`. Distinct from Materialize (first-Send promote).
_Avoid_: Materialize, activate, session create (when you mean this Virtual-only step)

**Harness state transition**:
Pure fold that turns one Backend harness snapshot (and transition args) into the next legal snapshot — pending strip, inactive/drop, Session History replace, Materialize upsert, client-request begin/end. Callers (State Atoms, host churn) apply the result; does not speak ACP or own Atom writes.
_Avoid_: reducer (when you mean this module), patchSession (map helper only), session update apply

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs initialize, then (in parallel, after `usable`) Config probe and session list, and retries on failure. One per mounted target; runs in parallel with siblings. Does not own the session transcript.
_Avoid_: Connection, provider instance, worker, ACP client runtime (when you mean this host-owned program)

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
The downloaded program backing a Provider (see ao-home _Provider runtime document_). Check for latest resolves the newest version without touching the running provider; Download fetches it in the background; Install switches the Active runtime (stopping the provider, bootstrapping once, then deleting superseded runtimes); Remove clears it.
_Avoid_: adapter resource tree, bundled adapter

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
Per-launch-target index of default model, per-model selectable option rows, and Unavailable models. Hydrated from ao-home cache before Backend Harnesses mount, seeded by Config probe when the cache is missing, then kept current and persisted by Lazy hydrate. Rows may be missing for models not yet selected.
_Avoid_: Provider catalog, harness defaults, config catalog

**Config probe**:
Runs only when no cached Config option index exists, before Bootstrap `usable`: one disposable-cwd `session/new` (then best-effort close/delete) that seeds the model list and the default model's row. Not an Active session; never Materialize; never a durable History entry the user should see. Canonical definition in the desktop glossary.
_Avoid_: Session create, materialize, activate

**Lazy hydrate**:
Updating the Config option index from a live `session/new` or `session/set_config_option(model)` response instead of probing. Picking a model with no cached row sends `set_config_option` to the Virtual draft's Bound session to learn its row. Canonical definition in the desktop glossary.
_Avoid_: refresh, re-probe

**Session History**:
Per-launch-target Harness view of `session/list`, hydrated from ao-home before Backend Harnesses mount. Cached rows are unavailable until confirmed by a successful list; cwd-scoped refreshes preserve rows from other workspaces. Archived rows are cached but filtered out by `visibleSessionHistoryAtom`. Canonical definition in the desktop glossary.
_Avoid_: Roster, Session roster, Adapter history document, session snapshot

**Unavailable model**:
A model id advertised on `session/new` whose `session/set_config_option(model)` soft-failed when picked; kept visible in model selects as disabled `(unavailable)`, with no row. Cleared when a later pick succeeds.
_Avoid_: Missing model, failed model, disabled model (when you mean this outcome)

**Developer panel**:
Shared Harness UI debug surface (RPC wire log, Session State, host-supplied extra tabs). Open preference and the open/close toggle are shared; hosts own pane layout chrome and host-only tabs.
_Avoid_: Devtools panel, debug drawer (when you mean this surface)

**Available Command**:
A session-advertised ACP command entry from `available_commands_update` (`name` + optional `description`), stored on the session snapshot for the Composer Menu and Command Chip matching.
_Avoid_: slash palette entry, skill definition (when you mean this list item)

**Composer Trigger**:
An in-progress `/`, `$`, or `@` token in the chat draft that opens a Composer Menu (agent-specific rules for where `/` and `$` may start; `@` is whitespace-bounded and opens from `@` alone).
_Avoid_: autocomplete, slash palette (when you mean the open-menu token)

**Composer Menu**:
The floating list opened by a Composer Trigger — Available Commands for `/` and `$`, or filesystem paths for `@`.
_Avoid_: autocomplete, slash palette, picker (when you mean this list)

**Filesystem Mention**:
Choosing a filesystem path from the `@` Composer Menu; the draft receives a markdown link that displays as a Markdown Link Chip (not a separate chip kind). Recursive `@` listing (and the New Session shallow directory picker) always exclude `.git` and honor Always-hidden globs from User settings; Show hidden does not override those excludes. See `@lib/ao-home` Always-hidden glob.
_Avoid_: mention chip, file chip, @ chip (when you mean this selection act or its resulting Markdown Link Chip)

**Command Chip**:
A display pill for a completed invocation token (`/name` or `$name`) that exact-matches a current Available Command. Label stays the raw invocation (no leading kind glyph). In the composer it is a Lexical decorator; in user transcript bubbles it is an inert span. Commands remain plain text in the draft, in stored user-message text, and in `session/prompt` text segments; chips re-evaluate against the current Available Commands list.
_Avoid_: Markdown Link Chip, skill pill, autocomplete token, mention chip (when you mean this pill)

**Markdown Link Chip**:
A display pill whose underlying text is a markdown link `[label](href)` (filesystem path or URL); shows the label only and may show a leading file-type or link glyph. In the composer it is a Lexical decorator; in user transcript bubbles it is a span that follows the Chat Markdown Link click rules. The draft/transcript markdown string is the source of truth; on send, filesystem links become ACP ContentBlocks while non-filesystem links stay inside text segments. A Filesystem Mention is one way such a link enters the draft.
_Avoid_: Command Chip, mention chip, hyperlink (when you mean this pill)

**Chat Markdown Link**:
Inline link in rendered chat markdown from agent text, thoughts, or tool results. Only `http(s)` and Host-supported `file://` or workspace-path links are clickable; clicks never navigate the webview. Transcript Markdown Link Chips (user `resource` / `resource_link` prompts) follow the same rules. Scheme-less workspace paths resolve against the session cwd.

**Composer Image Attachment**:
A draft-side image picked via Host FileDialog, held in-memory as metadata plus a base64 data URL from the read bytes (preview only — no thumbnail processing). On `session/prompt`, when the Agent advertises `promptCapabilities.image`, it is sent as an ACP Image ContentBlock (`data` + `mimeType` + `uri`); otherwise as a baseline `type: "resource_link"` (not UI-gated, not `embeddedContext`). Transcript keeps slim refs (mime/name/uri/preview data URL); after `session/load` / `user_message_chunk`, image-like `resource_link`s, ACP `type: "image"` blocks, `file://` image markdown links, or allowlisted `data:image/…;base64,…` markdown links lift into those refs (inline data / image blocks keep the preview; `file://` hydrates when possible).
_Avoid_: embedded resource, clipboard image, paste/drop attach (follow-ups)

**Attention event**:
A moment the user should notice in any session (not only the Selected one): a prompt turn ending with any stop reason except `cancelled` (including the handoff prompt for a pinned session — `promptPinnedSession`, unrelated to Pin, the user mark in the desktop glossary), a new Pending permission, or a new Pending elicitation. RPC errors are not Attention events. Each raises a Notification (title = session chat title, or `Chat` before the session has a history entry; fixed body phrase) subject to the Notifications, Notification sound, and Only-notify-when-unfocused User settings.
_Avoid_: alert, ping, completion event

**Copy message**:
The control under a transcript user or agent message that writes that message's Markdown source to the Host clipboard. For user messages, Command Chips copy as the raw invocation and Markdown Link Chips as `[label](href)`; injected context blocks and images are omitted. Does not apply to thoughts or tool output, and is distinct from the selection copy inside a user bubble.
_Avoid_: copy button (when you mean the behavior), copy rendered text

For Host services and BundledResource / Clipboard / FileDialog vocabulary, see [`../context-services/GLOSSARY.md`](../context-services/GLOSSARY.md). Session and Settings domain terms live primarily in [`../../apps/desktop/GLOSSARY.md`](../../apps/desktop/GLOSSARY.md). VS Code sidebar view terms (Workspace folder, Workspace cwd, Session History, Chat) live in [`../../apps/vscode/GLOSSARY.md`](../../apps/vscode/GLOSSARY.md). Shared session transcript/composer React lives in this package for both host apps to route or wrap.

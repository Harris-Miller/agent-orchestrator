# ui

Shared Agent Harness webview context: Backend Harness behavior, Harness application state, and shared React surfaces (Providers Settings, ACP backend mount, AppThemeProvider) consumed by the desktop app and (planned) VS Code webview. Host apps still own host-specific chrome (Appearance ThemeSelect, Settings shell).

## Language

**Harness application state**:
The reactive Harness state shared across host webviews — backend harness phase and selection, sessions, chat, handoff, and User settings projections.
_Avoid_: App atoms, store, desktop atoms, Redux

**Backend harness**:
A long-running Harness worker for one agent launch target: spawns the ACP Agent subprocess, runs initialize, Config probe, and buffered session list, and retries on failure. One per mounted target; runs in parallel with siblings. Does not own the session transcript.
_Avoid_: Connection, provider instance, worker, ACP client runtime (when you mean this host-owned program)

**Bootstrap phase**:
Harness-reported lifecycle while bringing a backend harness online: connecting → initialized → probing → ready, or error. Client-side setup only — not an ACP Session or Turn.
_Avoid_: Status, connection state, phase atoms

**Developer panel**:
Shared Harness UI debug surface (RPC wire log, Session State, host-supplied extra tabs). Open preference and the reopen affordance are shared; hosts own pane layout chrome and host-only tabs.
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
Choosing a filesystem path from the `@` Composer Menu; the draft receives a markdown link that displays as a Markdown Link Chip (not a separate chip kind).
_Avoid_: mention chip, file chip, @ chip (when you mean this selection act or its resulting Markdown Link Chip)

**Command Chip**:
A display pill for a completed invocation token (`/name` or `$name`) that exact-matches a current Available Command. Label stays the raw invocation (no leading kind glyph). In the composer it is a Lexical decorator; in user transcript bubbles it is a display-only span. Commands remain plain text in the draft, in stored user-message text, and in `session/prompt` text segments; chips re-evaluate against the current Available Commands list.
_Avoid_: Markdown Link Chip, skill pill, autocomplete token, mention chip (when you mean this pill)

**Markdown Link Chip**:
A display pill whose underlying text is a markdown link `[label](href)` (filesystem path or URL); shows the label only (not clickable) and may show a leading file-type or link glyph. In the composer it is a Lexical decorator; in user transcript bubbles it is a display-only span. The draft/transcript markdown string is the source of truth; on send, filesystem links become ACP ContentBlocks while non-filesystem links stay inside text segments. A Filesystem Mention is one way such a link enters the draft.
_Avoid_: Command Chip, mention chip, hyperlink (when you mean this pill)

For Host services and BundledResource / Clipboard vocabulary, see [`../context-services/CONTEXT.md`](../context-services/CONTEXT.md). Session and Settings domain terms live primarily in [`../../apps/desktop/CONTEXT.md`](../../apps/desktop/CONTEXT.md). VS Code sidebar view terms (Workspace folder, Workspace cwd, Session History, Chat) live in [`../../apps/vscode/CONTEXT.md`](../../apps/vscode/CONTEXT.md). Shared session transcript/composer React lives in this package for both host apps to route or wrap.

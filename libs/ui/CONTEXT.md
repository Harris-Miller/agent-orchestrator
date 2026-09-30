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
Shared Harness UI debug surface (RPC wire log, Session State, host-supplied extra tabs). Host apps own open/close chrome (e.g. Allotment) and host-only tabs.
_Avoid_: Devtools panel, debug drawer (when you mean this surface)

For Host services and BundledResource / Clipboard vocabulary, see [`../context-services/CONTEXT.md`](../context-services/CONTEXT.md). Session and Settings domain terms live primarily in [`../../apps/desktop/CONTEXT.md`](../../apps/desktop/CONTEXT.md). VS Code sidebar view terms (Workspace folder, Workspace cwd, Session History, Chat) live in [`../../apps/vscode/CONTEXT.md`](../../apps/vscode/CONTEXT.md). Shared session transcript/composer React lives in this package for both host apps to route or wrap.

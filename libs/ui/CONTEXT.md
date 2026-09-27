# ui

Shared Agent Harness webview context: Backend Harness behavior and Harness application state consumed by the desktop app and (planned) VS Code webview. Host apps still own React surfaces until a second consumer mounts them here.

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

For Host services and BundledResource vocabulary, see [`../context-services/CONTEXT.md`](../context-services/CONTEXT.md). Session, chat, and Settings terms used by this state still live primarily in [`../../apps/desktop/CONTEXT.md`](../../apps/desktop/CONTEXT.md) until VS Code adopts them as a second consumer.

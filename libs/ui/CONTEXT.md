# ui

Shared webview application state (Effect Atoms) and Backend Harness stack for the desktop Agent Harness and the VS Code extension webview. React components stay in host apps until a second consumer mounts them.

## Language

**Backend Harness**:
The Effect program that spawns an ACP adapter, runs initialize / Config probe / session list, and streams session updates into Atom state.
_Avoid_: ACP client runtime (when you mean this host-owned program)

**App atoms**:
Host-bound Effect Atoms for harness, chat, session lifecycle, handoff, and User settings — created via `createAppAtoms(runtimeBag)` after `createHostRuntime(hostLayer)`.
_Avoid_: jotai atoms, Redux store

**Phase atoms**:
Atom projection of per-launch-target bootstrap phase and session selection (`backendState` / `allLaunchTargetPhasesAtom`).
_Avoid_: Providers state (Providers UI may stay desktop-local)

**Host runtime factory**:
`createHostRuntime(hostLayer)` builds Atom + ManagedRuntime from portable Host services. Apps bind Live Layers (`TauriServicesLive`); shared code never imports `*Live` or Tauri.
_Avoid_: atomRuntime singleton (when you mean the factory)

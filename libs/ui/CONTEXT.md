# ui

Shared webview application state (Effect Atoms) and Backend Harness stack for the desktop Agent Harness and the VS Code extension webview. React components stay in host apps until a second consumer mounts them.

## Language

**Backend Harness**:
The Effect program that spawns an ACP adapter, runs initialize / Config probe / session list, and streams session updates into Atom state.
_Avoid_: ACP client runtime (when you mean this host-owned program)

**App atoms**:
Host-bound Effect Atoms for harness, chat, session lifecycle, handoff, and User settings. Apps call `bindHostRuntime(createHostRuntime(liveLayer))` before importing Atoms (desktop: `createHostRuntime.ts` side-effect, then App). Shared React can import Atoms directly from `@lib/ui`.
_Avoid_: jotai atoms, Redux store, createAppAtoms host re-export barrel

**Phase atoms**:
Atom projection of per-launch-target bootstrap phase and session selection (`backendState` / `allLaunchTargetPhasesAtom`).
_Avoid_: Providers state (Providers UI may stay desktop-local)

**Host runtime factory**:
`createHostRuntime(hostLayer)` builds Atom + ManagedRuntime from portable Host services. `bindHostRuntime` installs the app Live bag into a module slot (`@lib/ui/host-runtime` has no Atom imports — safe to load first). Shared code never imports `*Live` or Tauri.
_Avoid_: atomRuntime singleton without bind

# ui

Shared webview harness stack and (later) React UI surfaces for the desktop Agent Harness and the VS Code extension webview.

## Language

**Backend Harness**:
The Effect program that spawns an ACP adapter, runs initialize / Config probe / session list, and streams session updates into Atom state.
_Avoid_: ACP client runtime (when you mean this host-owned program)

**Phase atoms**:
Atom projection of per-launch-target bootstrap phase and session selection (`backendState` / `allLaunchTargetPhasesAtom`).
_Avoid_: Providers state (Providers UI may stay desktop-local)

**Host runtime factory**:
`createHostRuntime(hostLayer)` builds Atom + ManagedRuntime from portable Host services. Apps bind Live Layers (`TauriServicesLive`); shared code never imports `*Live` or Tauri.
_Avoid_: atomRuntime singleton (when you mean the factory)

**Harness atoms factory**:
`createHarnessAtoms(runtimeBag)` builds mount/restart harness Atoms from a bound Host runtime bag (same pattern as user-settings atoms). Desktop thin file binds once.
_Avoid_: bindHostRuntime init slot

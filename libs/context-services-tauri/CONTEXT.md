# context-services-tauri

Tauri live layers for `@lib/context-services` and Effect platform primitives (Path, FileSystem, ChildProcessSpawner) — analogous to `@effect/platform-node`'s `NodeServices.layer`.

## Language

**OS live layer**:
The Tauri implementation of the OS service (`OSLive`), backed by Tauri plugins and host IPC (`host_process_info`).
_Avoid_: Tauri OS, process service

**Tauri services**:
The desktop Live Adapter of portable **Host services** (`TauriServicesLive`) — ChildProcessSpawner, FileSystem, OS, and Path on top of Tauri. Desktop composition may also install host ConfigProvider and optional OTLP observability; those extras are not part of the Host services type.
_Avoid_: Platform layer, adapters, Host services (when you mean the desktop Adapter specifically)

For host vocabulary (`OS`, `Host`, `Host services`), see [`../context-services/CONTEXT.md`](../context-services/CONTEXT.md).

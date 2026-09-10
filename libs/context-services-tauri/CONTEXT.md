# context-services-tauri

Tauri live layers for `@lib/context-services` and Effect platform primitives (Path, FileSystem, ChildProcessSpawner) — analogous to `@effect/platform-node`'s `NodeServices.layer`.

## Language

**OS live layer**:
The Tauri implementation of the OS service (`OSLive`), backed by Tauri plugins and host IPC (`host_process_info`).
_Avoid_: Tauri OS, process service

**Tauri services**:
The aggregate live layer (`TauriServicesLive`) that provides OS, Path, FileSystem, ChildProcessSpawner, host ConfigProvider, and optional OTLP observability on top of Tauri.
_Avoid_: Platform layer, adapters

For host vocabulary (`OS`, `Host`), see [`../context-services/CONTEXT.md`](../context-services/CONTEXT.md).

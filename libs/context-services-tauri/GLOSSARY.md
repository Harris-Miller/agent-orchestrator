# context-services-tauri

Tauri live layers for `@lib/context-services` and Effect platform primitives (Path, FileSystem, ChildProcessSpawner, BundledResource, Clipboard, FileDialog) — analogous to `@effect/platform-node`'s `NodeServices.layer`.

## Language

**OS live layer**:
The Tauri implementation of the OS service (`OSLive`), backed by Tauri plugins and host IPC (`host_process_info`).
_Avoid_: Tauri OS, process service

**BundledResource live layer**:
The Tauri implementation of BundledResource (`BundledResourceLive`), wrapping `resolveResource` for packaged adapter entries.
_Avoid_: resolveResource (when you mean the portable Seam)

**Clipboard live layer**:
The Tauri implementation of Clipboard (`ClipboardLive`), wrapping `@tauri-apps/plugin-clipboard-manager` text APIs.
_Avoid_: clipboard-manager (when you mean the portable Seam)

**FileDialog live layer**:
The Tauri implementation of FileDialog (`FileDialogLive`), wrapping `@tauri-apps/plugin-dialog` `open` for file picks.
_Avoid_: plugin-dialog (when you mean the portable Seam)

**Tauri services**:
The desktop Live Adapter of portable **Host services** (`TauriServicesLive`) — BundledResource, ChildProcessSpawner, Clipboard, FileDialog, FileSystem, Notifier, OS, and Path on top of Tauri. Desktop composition may also install host ConfigProvider and OTLP observability (dev **Build target** only); those extras are not part of the Host services type.
_Avoid_: Platform layer, adapters, Host services (when you mean the desktop Adapter specifically)

For host vocabulary (`OS`, `Notifier`, `BundledResource`, `Clipboard`, `FileDialog`, `Host`, `Host services`), see [`../context-services/GLOSSARY.md`](../context-services/GLOSSARY.md).

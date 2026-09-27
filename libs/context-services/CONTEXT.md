# context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

## Host environment

**OS** (service):
The host environment abstraction — current working directory, allowlisted environment variables, home directory, and platform identifier — provided as an Effect `Context` service.
_Avoid_: Operating system, platform service, process

**BundledResource** (service):
Resolve a path relative to the host’s packaged resource root to an absolute filesystem path (desktop Tauri: `resolveResource`; VS Code: extension `asAbsolutePath` / URI).
_Avoid_: resolveResource, resource path API (when you mean the portable Seam)

**Host**:
The runtime environment that supplies a live implementation of Host services (Node/Bun today; other hosts later).
_Avoid_: Node, machine, runtime

**Host services**:
Portable aggregate of BundledResource, ChildProcessSpawner, FileSystem, OS, and Path — the Seam injected into host application runtimes (desktop: Host + Atom runtime composition). Desktop fulfills it with Tauri services; other hosts supply their own Live Adapter. Live Layers are composed only in `apps/*`, not by shared UI packages.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

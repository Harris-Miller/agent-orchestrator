# context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

## Host environment

**OS** (service):
The host environment abstraction — current working directory, allowlisted environment variables, home directory, and platform identifier — provided as an Effect `Context` service.
_Avoid_: Operating system, platform service, process

**Host**:
The runtime environment that supplies a live implementation of the OS service (Node/Bun today; other hosts later).
_Avoid_: Node, machine, runtime

**Host services**:
Portable aggregate of ChildProcessSpawner, FileSystem, OS, and Path — the Seam injected into the ACP Atom runtime. Desktop fulfills it with Tauri services; other hosts supply their own Live Adapter.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

# context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

## Host environment

**OS** (service):
The host environment abstraction — current working directory, allowlisted environment variables, home directory, and platform identifier — provided as an Effect `Context` service.
_Avoid_: Operating system, platform service, process

**Host**:
The runtime environment that supplies a live implementation of the OS service (Node/Bun today; other hosts later).
_Avoid_: Node, machine, runtime

# context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

## Host environment

**OS** (service):
The host environment abstraction — current working directory, allowlisted environment variables, home directory, and platform identifier — provided as an Effect `Context` service.
_Avoid_: Operating system, platform service, process

**BundledResource** (service):
The host capability that turns a path relative to the packaged resource root into an absolute filesystem path.
_Avoid_: resolveResource, asAbsolutePath, resource path API

**Host**:
The runtime environment that supplies a live implementation of Host services (desktop Tauri; VS Code later; Node/Bun for non-webview tools).
_Avoid_: Node, machine, runtime

**Host services**:
Portable aggregate of BundledResource, ChildProcessSpawner, FileSystem, OS, and Path — the Seam a host fulfills for Agent Harness code. Host apps compose Live Adapters; shared packages depend only on the portable tags.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

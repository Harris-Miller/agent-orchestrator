# context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

## Host environment

**OS** (service):
The host environment abstraction — current working directory, allowlisted environment variables, home directory, and platform identifier — provided as an Effect `Context` service.
_Avoid_: Operating system, platform service, process

**BundledResource** (service):
The host capability that turns a path relative to the packaged resource root into an absolute filesystem path.
_Avoid_: resolveResource, asAbsolutePath, resource path API

**Clipboard** (service):
The host capability for plain-text clipboard read and write (`writeText` / `readText`). React never imports host clipboard SDKs.
_Avoid_: clipboard-manager, navigator.clipboard (when you mean the portable Seam)

**Host**:
The runtime environment that supplies a live implementation of Host services to Harness code (desktop Tauri webview; VS Code webview; Node/Bun for non-webview tools). Prefer this generic term across Hosts; on VS Code the webview is the Host and the extension host fulfills behind Host IPC.
_Avoid_: Node, machine, runtime (when you mean the Seam consumer)

**Host services**:
Portable aggregate of BundledResource, ChildProcessSpawner, Clipboard, FileSystem, OS, and Path — the Seam a host fulfills for Agent Harness code. Host apps compose Live Adapters; shared packages depend only on the portable tags. Live Adapters stay in Host packages; Effect-only helpers those Adapters share (no Host SDK) may live in this package.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

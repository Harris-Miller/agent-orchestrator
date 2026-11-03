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

**FileDialog** (service):
The host capability to pick filesystem paths via a native open dialog (`pickFiles` → absolute paths; cancel → empty list). Does not return file bytes.
_Avoid_: showOpenDialog, plugin-dialog, `<input type="file">` (when you mean the portable Seam)

**DropTarget** (service):
The host capability that reports files and folders dropped from the OS onto the Host window, as absolute paths plus an enter / over / leave / drop lifecycle with a window-relative position. Needed only where the webview does not receive DOM drop events (desktop Tauri); the VS Code Host reports none.
_Avoid_: onDragDropEvent, dataTransfer, `<input type="file">` (when you mean the portable Seam)

**OpenUrl** (service):
The host capability to open an absolute http(s) URL in the system default browser / handler (`open`). Used for Antigravity Sign in, chat Markdown links, and similar external auth flows — not ACP elicitation URL mode.
_Avoid_: BROWSER helper, window.open, openExternal (when you mean the portable Seam)

**OpenFile** (service):
The host capability to open an absolute filesystem path in the Host editor; directories are revealed in Explorer. `openImageData` opens a Base64Image (base64 payload plus an OpenableImageMimeType: png, jpeg, gif, webp) by writing it to a Host temp file first, for thumbnails with no file uri. The `supported` flag reports availability. Desktop does not support it until #169.
_Avoid_: showTextDocument, vscode.open (when you mean the portable Seam)

**Host**:
The runtime environment that supplies a live implementation of Host services to Harness code (desktop Tauri webview; VS Code webview; Node/Bun for non-webview tools). Prefer this generic term across Hosts; on VS Code the webview is the Host and the extension host fulfills behind Host IPC.
_Avoid_: Node, machine, runtime (when you mean the Seam consumer)

**Host services**:
Portable aggregate of BundledResource, ChildProcessSpawner, Clipboard, FileDialog, DropTarget, FileSystem, HttpClient, OpenFile, OpenUrl, OS, and Path — the Seam a host fulfills for Agent Harness code. Host apps compose Live Adapters; shared packages depend only on the portable tags. Live Adapters stay in Host packages; Effect-only helpers those Adapters share (no Host SDK) may live in this package.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

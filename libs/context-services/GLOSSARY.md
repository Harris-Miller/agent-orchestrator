# context-services

Portable host-environment abstractions exposed as Effect `Context` services, independent of Node/Bun/Tauri.

## Host environment

**OS** (service):
The host environment abstraction — current working directory, allowlisted environment variables, home directory, and platform identifier — provided as an Effect `Context` service.
_Avoid_: Operating system, platform service, process

**Build target**:
Whether a bundle is a `dev` or `prod` build, fixed when the bundle is built.
_Avoid_: Environment, mode, release flag

**BundledResource** (service):
The host capability that turns a path relative to the packaged resource root into an absolute filesystem path.
_Avoid_: resolveResource, asAbsolutePath, resource path API

**Clipboard** (service):
The host capability for plain-text clipboard read and write (`writeText` / `readText`). React never imports host clipboard SDKs.
_Avoid_: clipboard-manager, navigator.clipboard (when you mean the portable Seam)

**FileDialog** (service):
The host capability to pick filesystem paths via a native open dialog (`pickFiles` → absolute paths; cancel → empty list). Does not return file bytes.
_Avoid_: showOpenDialog, plugin-dialog, `<input type="file">` (when you mean the portable Seam)

**Analytics** (service):
The host capability to capture a product Analytics event. Fire-and-forget: it cannot fail or block the caller, and an undeliverable event is dropped. Accepts only an Analytics event built from the closed catalog in `@lib/ui`.
_Avoid_: telemetry service, tracker, `posthog.capture` (when you mean the portable Seam)

**Analytics event**:
A named product event with allowlisted simple properties and no free text or Private data, captured when a user action succeeds. A separate pipeline from OTLP traces, logs and metrics. See root ADR 0004.

**App version**:
The version of the app bundle, fixed when the bundle is built. Sent with every Analytics event.

**Notifier** (service):
The host capability to raise an OS Notification (`notify({ title, body, sound })`), play its own chime without a Notification (`playSound`), report whether the Host window is focused (`isWindowFocused`), and report `supported: 'os' | 'in-app'`. Used for Attention events. Failures are swallowed by callers.
_Avoid_: toast service, plugin-notification, `new Notification` (when you mean the portable Seam)

**Notification**:
The OS toast a Notifier raises for an Attention event. Title is the session's chat title; body is a fixed phrase, never agent text. See `@lib/ui` Attention event.

**Notification sound**:
The sound that accompanies an Attention event, independent of Notifications. With Notifications on it is the system sound attached to the Notification (`sound: true`; a silent Notification is `sound: false`); with Notifications off it is a chime the app plays itself.

**OpenUrl** (service):
The host capability to open an absolute http(s) URL in the system default browser / handler (`open`). Used for Antigravity Sign in, chat Markdown links, and similar external auth flows — not ACP elicitation URL mode.
_Avoid_: BROWSER helper, window.open, openExternal (when you mean the portable Seam)

**OpenFile** (service):
The host capability to open an absolute filesystem path in the Host editor; directories are revealed in Explorer. `open` accepts an optional 1-based line the Host jumps to where it can; otherwise it is ignored. `openImageData` opens a Base64Image (base64 payload plus an OpenableImageMimeType: png, jpeg, gif, webp) by writing it to a Host temp file first, for thumbnails with no file uri. The `supported` flag reports availability. Desktop does not support it until #169.
_Avoid_: showTextDocument, vscode.open (when you mean the portable Seam)

**Host**:
The runtime environment that supplies a live implementation of Host services to Harness code (desktop Tauri webview; VS Code webview; Node/Bun for non-webview tools). Prefer this generic term across Hosts; on VS Code the webview is the Host and the extension host fulfills behind Host IPC.
_Avoid_: Node, machine, runtime (when you mean the Seam consumer)

**Host services**:
Portable aggregate of Analytics, BundledResource, ChildProcessSpawner, Clipboard, FileDialog, FileSystem, HttpClient, Notifier, OpenFile, OpenUrl, OS, Path, and VscodeExtension — the Seam a host fulfills for Agent Harness code. Host apps compose Live Adapters; shared packages depend only on the portable tags. Live Adapters stay in Host packages; Effect-only helpers those Adapters share (no Host SDK) may live in this package.
_Avoid_: Platform services, Tauri services (when you mean the portable aggregate)

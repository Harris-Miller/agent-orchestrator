# ADR 0002: Host IPC uses transferables, not RPC

## Status

Accepted

## Context

The VS Code webview Host must drive the same Effect `ChildProcessSpawner` / FileSystem shapes as the desktop (Tauri) Host. ACP adapters need a duplex byte pipe for stdio. Stock JSON-RPC (or Effect RPC) fits control calls poorly once large stdout/stderr chunks and `postMessage` transfer lists enter the picture.

## Decision

Use a purpose-built **Host IPC** protocol for this Host (extension↔webview wire): tagged JSON control messages with correlation ids, plus `ArrayBuffer` payloads on stdin/stdout/(piped) stderr chunk messages transferred via `postMessage`'s transfer list. Do not use JSON-RPC or Effect RPC for this wire. Prefer **Host IPC** when speaking generically across Hosts; **extension↔webview IPC** when naming this wire specifically.

## Consequences

- Protocol lives in `@lib/context-services-vscode-webview` (`./protocol`, free of `vscode` imports) and is shared with the extension: the request table and codec, plus both ends of the seam — `IpcClient` (webview) and `serveHostIpc` (extension dispatch to a complete Host IPC fulfillment). _Amended:_ originally types/codec only; extension dispatch moved here so the request table types both ends.
- Fake-peer unit tests exercise duplex framing without VS Code.
- Credit-based backpressure is out of scope; unbounded queues match Tauri parity.

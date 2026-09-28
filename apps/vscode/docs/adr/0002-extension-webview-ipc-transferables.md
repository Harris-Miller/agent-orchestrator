# ADR 0002: Extension↔webview IPC uses transferables, not RPC

## Status

Accepted

## Context

The VS Code webview must drive the same Effect `ChildProcessSpawner` / FileSystem shapes as the desktop Agent Harness. ACP adapters need a duplex byte pipe for stdio. Stock JSON-RPC (or Effect RPC) fits control calls poorly once large stdout/stderr chunks and `postMessage` transfer lists enter the picture.

## Decision

Use a purpose-built **extension↔webview IPC** protocol: tagged JSON control messages with correlation ids, plus `ArrayBuffer` payloads on stdin/stdout/(piped) stderr chunk messages transferred via `postMessage`'s transfer list. Do not use JSON-RPC or Effect RPC for this wire.

## Consequences

- Codec lives in `@lib/context-services-vscode-webview` (shared with extension types/codec only).
- Fake-peer unit tests exercise duplex framing without VS Code.
- Credit-based backpressure is out of scope; unbounded queues match Tauri parity.

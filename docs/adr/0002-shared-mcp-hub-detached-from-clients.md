# One shared MCP hub per machine; clients never own its process

Agents reach Harness tools (first: `submit_handoff`) through MCP, injected into every session as an HTTP server. A WebView cannot listen on a socket, so a Node **hub** listens and routes each tool call, by per-session bearer credential, over a WebSocket to the Harness client that owns the session. Tool logic stays in the Harness; the hub holds only credentials (pending or bound to a session), connected clients and calls in flight.

There is **one hub per machine**, shared by the desktop app and every local VS Code window, bound to a fixed `127.0.0.1` port (the bind is the single-instance lock). It exits after a grace period with no connected clients. Any client that finds no hub on `/health` starts one; nobody owns it.

**Exception to VS Code ADR 0003 ("webview lifetime equals process lifetime")**: both Hosts kill the children they track (Tauri on exit and reload, walking `pgrep -P` from each tracked pid; VS Code per webview), so a client never spawns the hub directly. It spawns the bundled launcher through the normal `ChildProcessSpawner`; the launcher starts the hub detached in its own session and exits at once, so the hub is reparented away from the client and outlives it.

## Consequences

- The hub is a self-contained bundle (`hub.mjs`, `hub-launcher.mjs`) shipped as a Tauri resource and inside the VSIX at the same relative path, `hub/`. Building either app builds `@lib/hub` first.
- Adding a tool means its argument schema and name in `@lib/hub/protocol`, a `Tool.make` in the hub's `tools.ts`, and a handler in the Harness's `HUB_TOOL_HANDLERS` (a missing handler fails to compile).
- When the hub cannot be used (Node missing, the port held by another program, a protocol mismatch, a remote VS Code window, start or connect failure) the client runs degraded: no MCP server is injected and Handoff is disabled with the reason. There is no text-matching fallback.
- A hub crash only fails calls in flight: clients reconnect, start a new hub on the same port, and re-register their credentials, so agents' MCP URLs keep working.

## Not built yet

Version negotiation beyond refusing a mismatch (a newer client cannot ask an older idle hub to exit), a fallback port, a stdio shim for agents without HTTP MCP, MCP-over-ACP, pre-approving the Claude adapter's permission prompt for hub tools, and cross-client tools (the hub records client kind and session bindings for them).

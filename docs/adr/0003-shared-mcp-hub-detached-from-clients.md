# One shared MCP hub per machine; clients never own its process

Agents reach Harness tools (first: `submit_handoff`) through MCP, injected into every session as an HTTP server. A WebView cannot listen on a socket, so a Node **hub** listens and routes each tool call, by per-session bearer credential, over a WebSocket to the Harness client that owns the session. Tool logic stays in the Harness; the hub holds only credentials (pending or bound to a session), connected clients and calls in flight.

There is **one hub per machine**, shared by the desktop app and every local VS Code window, bound to a fixed `127.0.0.1` port (the bind is the single-instance lock). It exits after a grace period with no connected clients. Any client that finds no hub on `/health` starts one; nobody owns it.

**Exception to VS Code ADR 0003 ("webview lifetime equals process lifetime")**: both Hosts kill the children they track (Tauri on exit and reload, walking `pgrep -P` from each tracked pid; VS Code per webview), so a client never spawns the hub directly. It spawns the bundled launcher through the normal `ChildProcessSpawner`; the launcher starts the hub detached in its own session and exits at once, so the hub is reparented away from the client and outlives it.

## Consequences

- The hub is a self-contained bundle (`hub.mjs`, `hub-launcher.mjs`) shipped as a Tauri resource and inside the VSIX at the same relative path, `hub/`. Building either app builds `@lib/hub` first.
- Adding a tool means its argument schema and name in `@lib/hub/protocol`, a `Tool.make` in the hub's `tools.ts`, and a handler in the Harness's `HUB_TOOL_HANDLERS` (a missing handler fails to compile).
- When the hub cannot be used (Node missing, the port held by another program, a protocol mismatch, a remote VS Code window, start or connect failure) the client runs degraded: no MCP server is injected and Handoff is disabled with the reason. There is no text-matching fallback.
- A hub crash only fails calls in flight: clients reconnect, start a new hub on the same port, and re-register their credentials, so agents' MCP URLs keep working.

- **Opt-in while experimental.** The hub client connects (and so may start the hub) only while the User setting `appOrchestratedAgentsEnabled` is on (labelled Experimental: App Orchestrated Agents; it gates Handoff and subagent spawning); it is off when unset. Off means no hub is started, no MCP server is injected, and the Session actions strip hides Handoff. Sessions opened before the setting was turned on stay unconnected until reopened.
- **Fixed port, no fallback.** A fallback port would change agents' MCP URLs across a hub restart. A user whose port is taken sets `hubPort` in `~/.hoa/settings.json` (read by every client, so all agree); it is read leniently, outside the strict settings schema, so a bad value only falls back to the default port.
- **Version skew degrades, then heals by itself.** A client refuses a hub with another protocol version and says which windows to close. A hub with no clients exits after its grace period, and the client's reconnect loop then starts one it speaks. There is no takeover endpoint (an older hub could not honour one anyway, and it would save at most one grace period per upgrade).
- **Hub logs** go to `~/.hoa/logs/hub.log`: the launcher appends the hub's stdout / stderr there, moving it to `hub.log.1` when over 1 MiB.
- **Size limits**: agent request bodies and `/clients` frames are capped at 1 MiB; `submit_handoff`'s document is capped in its schema, so an oversize one reaches the agent as invalid params rather than an opaque HTTP error. No rate limiting: every caller is a local process holding a credential.
- **Claude permission prompts**: hub tools are pre-approved for the Claude adapter (`_meta.claudeCode.options.allowedTools` on each session RPC that injects the hub), so a Handoff never stops on a permission prompt.
- **Credentials stay out of logs.** Session tokens live in memory only; the RPC wire log redacts `mcpServers` headers and env, the developer panel's hub log shortens tokens, and RPC spans carry no payloads. The hub secret rides in the `/clients` query (browser WebSockets cannot set headers); the HTTP request logger drops query strings. `/health` stays readable cross-origin: it reveals only the app id, pid and protocol version.
- The discovery file is mode 0600. On Windows that mode is not enforced; the file relies on the user profile's inherited owner-only ACL.
- A hub restart drops agents' MCP sessions: the hub answers their old session id with 404, which MCP clients answer by re-initializing.

## Not built yet

A stdio shim for agents without HTTP MCP, MCP-over-ACP, cross-client tools (the hub records client kind and session bindings for them), and a "reconnect session" action for sessions that started while the hub was unavailable.

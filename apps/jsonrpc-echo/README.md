# jsonrpc-echo

ACP-shaped test agent that speaks newline-delimited JSON-RPC 2.0 over stdio. Used by `@libs/effect-acp` integration tests and for manual protocol debugging.

### Basic example

```
(printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": 1 } }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "session/new", "params": { "cwd": ".", "mcpServers": [] } }' \
  '{ "jsonrpc": "2.0", "id": 3, "method": "session/prompt", "params": { "sessionId": "echo-session-1", "prompt": [{ "type": "text", "text": "Hello" }] } }' \
; cat) | bun run src/main.ts
```

After `session/prompt`, the agent emits a `session/update` notification before returning `{ "stopReason": "end_turn" }`.

### Double initialize

```
(printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": 1 } }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "initialize", "params": { "protocolVersion": 1 } }' \
; cat) | bun run src/main.ts
```

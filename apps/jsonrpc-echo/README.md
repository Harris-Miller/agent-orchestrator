# jsonrpc-echo

ACP-shaped test agent that speaks newline-delimited JSON-RPC 2.0 over stdio. Used by `@libs/effect-acp` integration tests and for manual protocol debugging.

On `session/prompt`, the agent replays one or more spec-correct `session/update` notifications from `fixtures/*.jsonl`, then returns `{ "stopReason": "end_turn" }`.

### Fixture selection

- Default: `fixtures/simple-reply.jsonl` (one `agent_message_chunk` echoing the prompt text).
- Named fixture: include `/fixture <name>` in the prompt text (e.g. `/fixture tool-turn` loads `fixtures/tool-turn.jsonl`).

Available fixtures:

| Name | Simulates |
| --- | --- |
| `simple-reply` | Single streamed agent message (default) |
| `tool-turn` | Plan → message → tool call lifecycle |
| `session-metadata` | Commands, config, and session info updates |
| `load-replay` | User/agent message chunks (session/load style) |
| `usage` | Context window and cost telemetry |

Each `.jsonl` line is one ACP `SessionUpdate` object (the `params.update` payload). Use `{{promptText}}` in string fields to substitute the joined prompt text.

### Session lifecycle

```
(printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": 1 } }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "session/list", "params": {} }' \
  '{ "jsonrpc": "2.0", "id": 3, "method": "session/new", "params": { "cwd": ".", "mcpServers": [] } }' \
  '{ "jsonrpc": "2.0", "id": 4, "method": "session/prompt", "params": { "sessionId": "<from session/new>", "prompt": [{ "type": "text", "text": "Hello" }] } }' \
; cat) | bun run src/main.ts
```

`session/list` returns an empty array on a fresh instance; created session UUIDs appear after `session/new`. `session/load` replays stored chat history via `session/update` notifications.

### Tool-turn fixture

```
(printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": 1 } }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "session/new", "params": { "cwd": ".", "mcpServers": [] } }' \
  '{ "jsonrpc": "2.0", "id": 3, "method": "session/prompt", "params": { "sessionId": "<from session/new>", "prompt": [{ "type": "text", "text": "/fixture tool-turn" }] } }' \
; cat) | bun run src/main.ts
```

### Double initialize

```
(printf '%s\n' \
  '{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": 1 } }' \
  '{ "jsonrpc": "2.0", "id": 2, "method": "initialize", "params": { "protocolVersion": 1 } }' \
; cat) | bun run src/main.ts
```

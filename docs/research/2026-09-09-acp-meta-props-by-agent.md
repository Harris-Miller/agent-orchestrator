# ACP `_meta` props by agent, message tag, and `sessionUpdate`

Date: 2026-09-09
Question: What properties appear in `"_meta"` objects on ACP RPC traffic (especially `session/update` and RPC responses), broken down per agent, per message tag, and for `session/update` per `sessionUpdate` type?

## Summary

Live RPC wire logs from the desktop prototype (both backends activated, chats loaded) show `_meta` on:

1. **`initialize` responses** — shared top-level keys `goal`, `jetbrains`, `steering`, plus agent-specific nested `_meta`
2. **`session/update` notifications** — agent-private namespaces on `payload.update` (and sometimes nested on child objects)

No `_meta` appeared on `session/list` / `session/load` responses or on outbound requests in this capture.

| Agent | Wire entries | `_meta` on | Private stream namespace |
| --- | --- | --- | --- |
| Codex (`@agentclientprotocol/codex-acp` 1.8.0) | 205 | `initialize` response; most `session/update` | `codex`, `terminal_*`, `goal` |
| Claude (`@agentclientprotocol/claude-agent-acp` 0.73.0) | 94 | `initialize` response; tool-call `session/update` only | `claudeCode` |

## Method

Source: in-app RPC wire log (`BackendSnapshot.rpcCalls` in `apps/desktop/src/prototype/agentChat/acpBackendAtoms.ts`), read via Tauri MCP (`webview_execute_js` over React fiber / Effect Atom state) while `pnpm run tauri:dev` was running and existing chats were activated.

Message shape in the log is Effect RPC wire (outbound tagged requests with `tag`/`payload`; inbound responses as `{ _tag, exit, requestId }`; notifications as tagged messages with `isNotification`).

`_meta` locations searched: message root, `payload`, `payload.update`, nested objects under the initialize result (`authMethods`, `agentCapabilities`), and `availableCommands[]` entries.

## Codex (`@agentclientprotocol/codex-acp` 1.8.0)

### By message tag

| Tag | `_meta`? | Location / props |
| --- | --- | --- |
| **Response:`initialize`** | yes | Result top-level: `goal`, `jetbrains`, `steering`. Nested on `authMethods[0]`: `api-key` |
| **Response:`session/list`** | no | — |
| **Response:`session/load`** | no | — |
| **`session/update`** | often (151/181) | Usually on `payload.update`; nested on command entries for `available_commands_update` |
| Requests (`initialize`, `session/list`, `session/load`) | no | — |

### `initialize` response `_meta`

Top-level on the result value:

```json
{
  "goal": {
    "actions": ["set", "pause", "resume", "…"],
    "controlMethod": "_session/goal",
    "version": 1
  },
  "jetbrains": {
    "air": {
      "version": 1,
      "capabilities": [
        "sessionFailure",
        "agentFileChangeReport",
        "nativeSubagentSessions"
      ]
    }
  },
  "steering": { "supported": true }
}
```

Nested: `authMethods[0]._meta` → `{ "api-key": { "provider": "openai" } }`.

### `session/update` by `sessionUpdate`

| `sessionUpdate` | with `_meta` / total | Top-level `_meta` keys |
| --- | --- | --- |
| **`agent_message_chunk`** | 25/25 | `codex` → `{ phase }` (`commentary` ×11, `final_answer` ×14) |
| **`session_info_update`** | 10/20 | `goal` (always `null` in this capture) |
| **`tool_call`** | 53/57 | `terminal_info` → `{ cwd, terminal_id }` |
| **`tool_call_update`** | 53/55 | Usually both `terminal_exit` + `terminal_output_delta`; once only `terminal_exit` |
| **`available_commands_update`** | 0/10 on the update itself | Nested on `availableCommands[]`: `commandAction` → `{ configId, kind, presentation, resetValue, value }` (observed: `collaboration_mode` / `setConfigOption` / `state` / `default` / `plan`) |
| **`user_message_chunk`** | 0/14 | — |

**`tool_call_update` detail:**

- `terminal_exit`: `{ exit_code, signal, terminal_id }` (`exit_code` mostly `0`, also `1`/`2`; `signal` always `null`)
- `terminal_output_delta`: `{ data, terminal_id }`

## Claude (`@agentclientprotocol/claude-agent-acp` 0.73.0)

### By message tag

| Tag | `_meta`? | Location / props |
| --- | --- | --- |
| **Response:`initialize`** | yes | Result top-level: `goal`, `jetbrains`, `steering`. Nested on `agentCapabilities`: `claudeCode` |
| **Response:`session/list`** | no | — |
| **Response:`session/load`** | no | — |
| **`session/update`** | 50/80 | Only on tool-call updates; always `claudeCode` on `payload.update` |
| Requests | no | — |

### `initialize` response `_meta`

Top-level on the result value:

```json
{
  "goal": {
    "actions": ["set", "clear"],
    "controlMethod": "_session/goal",
    "version": 1
  },
  "jetbrains": {
    "air": {
      "version": 1,
      "capabilities": ["…"]
    }
  },
  "steering": { "supported": true }
}
```

Nested: `agentCapabilities._meta` → `{ "claudeCode": { "promptQueueing": true } }`.

### `session/update` by `sessionUpdate`

| `sessionUpdate` | with `_meta` / total | Top-level `_meta` keys |
| --- | --- | --- |
| **`tool_call`** | 25/25 | `claudeCode` — variants below |
| **`tool_call_update`** | 25/25 | `claudeCode` → `{ toolName }` only |
| **`agent_message_chunk`** | 0/12 | — |
| **`available_commands_update`** | 0/5 | — |
| **`user_message_chunk`** | 0/13 | — |

**`tool_call` `claudeCode` variants observed:**

- `{ toolName, skill, skillPath }` — Skill tools (`caveman`, `ponytail`)
- `{ toolName, title }` — Bash
- `{ toolName }` only — e.g. Read

Observed `claudeCode.toolName` counts: `Bash`×18, `Skill`×6, `Read`×1.

## Cross-agent takeaways

- Shared **`initialize` response** `_meta` namespace: `goal`, `jetbrains`, `steering`.
- Agent-specific extras on initialize: Codex nests `api-key` on auth methods; Claude nests `claudeCode.promptQueueing` on `agentCapabilities`.
- Stream `_meta` is agent-private: Codex uses `codex` / `terminal_*` / `goal`; Claude uses only `claudeCode`.
- No `_meta` on `session/list` or `session/load` responses in this capture.

## Related code

- Wire log UI / entry type: `apps/desktop/src/prototype/agentChat/RpcWireLogPanel.tsx`, `apps/desktop/src/prototype/agentChat/agentHarness.ts` (`RpcWireEntry`)
- Per-backend accumulation: `apps/desktop/src/prototype/agentChat/acpBackendAtoms.ts` (`rpcCalls`)
- ACP schema `_meta` fields: `libs/effect-acp/src/schema/`

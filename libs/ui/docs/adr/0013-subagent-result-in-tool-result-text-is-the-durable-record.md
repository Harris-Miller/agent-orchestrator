# A Spawned subagent session survives replay as a Restored subagent, rebuilt from the Hub tool result text

A Spawned subagent session exists only as in-memory Harness state (ADR 0011), so `session/load` of its parent replayed only generic `spawn_subagent` / `wait_subagent` tool-call rows. All three Hub tools that return a child (`spawn_subagent`, foreground or background, and `wait_subagent`) now return one `<subagent id status launchTarget description config task>` element (the Subagent result) around the child's final message, and the replay path recognises Hub subagent tool calls by title and rebuilds a read-only `spawned` Subagent snapshot (a Restored subagent) from that text alone, shown as the usual transcript row.

## Considered options

- **Put the metadata in `_meta` / `structuredContent` of the MCP result:** rejected; the Hub result type is `{ isError, text }` and ACP servers forward those fields differently (and not at all on replay). Result text is the only channel every server replays.
- **Read the spawn arguments from `rawInput`:** rejected; `rawInput` is formatted per provider and omits what the Harness resolved (applied Config option values, the child id).
- **A durable parent→child store in `~/.hoa`:** rejected for now; it would also let Session History hide the child again, but it is a second source of truth beside the agent's transcript, and pre-alpha does not need it.

## Consequences

- The result text is now a persisted contract: changing the `<subagent …>` shape strands already recorded sessions on generic tool-call rows. A session recorded before this change keeps those rows (no migration; pre-alpha).
- Codex replays an MCP tool result only as `rawOutput` (no `content`), so the result text is read from `content` first, then from the text found in `rawOutput`. Recognition is by tool-call title (the Hub server name plus tool), because the replayed title is the bare function name while a live one is `Tool: server/tool`. The live Codex wire shape was captured as `{ result: { content: [...] }, error }` (a `tool_call_update` with `rawOutput` only), so `result` is unwrapped and a sibling `error: null` ignored. The remaining `rawOutput` shapes handled (string, content-item array, `{content}`/`{text}`, externally tagged `{Ok:{…}}`, JSON-stringified) are still inferred from `codex-acp` source (`replay_response_item` → `send_tool_call_completed(raw_output)`), not captured from a replay, so the extraction is deliberately tolerant.
- A Restored subagent shows only the child's final message, not its full transcript. Opening the child's own session on demand is left to a later change; the child is not a Tracked session after a restart, so it does not appear in Session History.
- A background spawn's tool result only says `running`; its outcome arrives later as a Subagent report user message. That message is also parsed on replay and upgrades the Restored subagent (body as its final message, reported Work state). A background child whose report never arrived, or was not replayed, still shows an unknown Work state.
- The Subagent report text is therefore a second persisted contract, built and parsed only in `host/subagentResult.ts`; its description and task are flattened to one line so the body is unambiguous.
- Body closing tags are escaped as `<\/subagent` (and the parser reverses it), so a child's final text cannot end the element early or inject phantom results.

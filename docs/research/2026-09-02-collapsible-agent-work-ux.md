# Collapsible agent work UX for apps/desktop

Date: 2026-09-02
Question: How should `apps/desktop` Agent Chat emulate Cursor / ChatGPT-Codex / T3-style collapsible “work” chunks (thoughts, tool calls, exploration summaries) given ACP V1 session updates and the current flat `ChatItem` model?

## Summary

Harness screenshots converge on one product pattern: **hide process behind a top-level “Worked for Ns” control, keep the answer fully visible**. Nested thoughts, per-tool expand, and “Explored N files” / “Loaded tools…” labels are polish layers on top of that.

ACP V1 already streams the raw materials (`agent_thought_chunk`, `tool_call` / `tool_call_update`, `plan`, `agent_message_chunk`) but **does not send wall-clock duration or exploration summaries** — those are client UX inventions. The desktop Harness UI flattens handled updates into ordered `ChatItem`s and renders every `tool_call` fully expanded with no collapse.

**Recommended default (ponytail):** option **A** — pure view-layer grouping of consecutive work items under one MUI `Accordion` (already used in the RPC wire log), default collapsed when the turn is idle. Leave the reducer/`ChatItem` model alone for the first cut; add thoughts + client-side timing only if needed.

## Screenshot pattern inventory

Sources live under the Cursor assets folder as attached research screenshots (filenames below). Harness labels follow chrome cues (input placeholder / app title), not marketing names.

### Pattern table

| Pattern                                      | What it looks like                                                                           | Seen in                                                                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level “Worked for Ns”                    | Single muted/pill header with chevron wrapping all process UI                                | Codex-style: `Screenshot_2026-09-02_at_10.32.15_PM-…png`, `…10.32.24…`, `…10.32.39…`, collapsed `…10.32.45…`; Cursor: `…10.35.40…` (collapsed 18s), `…10.36.09…` (expanded), `…10.35.48…`; T3-style: `…10.32.56…` / `…10.33.02…` / `…10.33.15…` (43s) |
| Default collapsed when done                  | Only duration row (or pill) + answer; process hidden                                         | `…10.32.45…`, `…10.35.40…`, `…10.32.56…`                                                                                                                                                                                                              |
| Default expanded while inspecting / mid-work | Full thought + tool tree visible under “Worked for Ns”                                       | `…10.32.15…`, `…10.32.24…`, `…10.32.39…`, `…10.36.09…`, `…10.33.15…`                                                                                                                                                                                  |
| Nested thought blocks                        | “Thought 1s” (+ optional nested chevron) with muted reasoning text                           | Codex-style: `…10.32.15…`, `…10.32.24…`, `…10.32.39…`                                                                                                                                                                                                 |
| Exploration / activity summary labels        | “Explored 2 files, 2 searches”, “Explored 3 files”, “Loaded tools, read files, ran commands” | Codex: `…10.32.15…`, `…10.32.39…`; T3: `…10.33.02…`, `…10.33.15…`                                                                                                                                                                                     |
| Compact tool rows + per-row expand           | One-line “Tool call …” / “Command run …” with chevron; detail only when expanded             | Cursor: `…10.36.09…`, `…10.35.48…`                                                                                                                                                                                                                    |
| Truncation / “show fewer”                    | “Show fewer tool calls”, “+4 previous tool calls”                                            | Cursor: `…10.36.09…`, `…10.35.48…`                                                                                                                                                                                                                    |
| Terminal-card tool bodies                    | `>_` header + bordered output / error inside work group                                      | Codex: `…10.32.15…`, `…10.32.24…`, `…10.32.39…`                                                                                                                                                                                                       |
| Answer outside the work collapse             | Final markdown always sibling below work, never inside the accordion                         | All positive harness shots above                                                                                                                                                                                                                      |
| Flat always-expanded “before”                | Every tool is a full card: `Tool: …`, `kind: …`, `completed` chip; no chevron/group          | `apps/desktop`: `…10.33.48…`, `…10.33.30…`, `…10.33.35…`                                                                                                                                                                                              |

### Concrete observations from “before” (`apps/desktop`)

- Chrome: title **Agent Chat**, status row `Echo` / `Codex` / `Claude: ready`, footer `agent: Codex · session: …`, config selects, **RPC wire log (436)** (`…10.33.30…`, `…10.33.35…`, `…10.33.48…`).
- Sequence is a linear list: user / agent text / many tool cards / later agent answer (`…10.33.30…` shows agent plan text **then** a wall of tools; `…10.33.35…` shows tools **then** “Agent” answer).
- No top-level work summary, no collapse affordance, no grouping — matches current `ChatItemView` tool rendering (cited below).

## ACP protocol surface

Primary sources:

- Index: https://agentclientprotocol.com/llms.txt
- Overview (session/update includes “Message chunks (agent, user, thought)”): https://agentclientprotocol.com/protocol/v1/overview.md
- Prompt turn (streaming plan / message / tool_call lifecycle): https://agentclientprotocol.com/protocol/v1/prompt-turn.md
- Tool calls (kinds, status, updates): https://agentclientprotocol.com/protocol/v1/tool-calls.md
- Agent plan: https://agentclientprotocol.com/protocol/v1/agent-plan.md
- Content blocks: https://agentclientprotocol.com/protocol/v1/content.md
- Installed schema `@agentclientprotocol/sdk@1.4.0` → `node_modules/.../@agentclientprotocol/sdk/schema/schema.json` (`SessionUpdate` oneOf consts at lines ~4986–5210)

### `sessionUpdate` kinds → meaning → desktop reducer

| `sessionUpdate`                                  | Meaning (protocol)                                                                         | Handled by `reduceSessionUpdate`?                                             | Becomes `ChatItem`?                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `user_message_chunk`                             | Streamed user message chunk (`ContentChunk`)                                               | Yes (`sessionUpdateReducer.ts` 319–328)                                       | `user_message`                                         |
| `agent_message_chunk`                            | Streamed agent answer chunk                                                                | Yes (208–217)                                                                 | `agent_message`                                        |
| `agent_thought_chunk`                            | Streamed **internal reasoning** chunk (schema const line ~5018; overview “thought” chunks) | **No** — falls through `default` (331–332)                                    | **Dropped**                                            |
| `tool_call`                                      | New tool invocation (`title`, `kind`, `status`, …)                                         | Yes (259–278)                                                                 | `tool_call` (always new row)                           |
| `tool_call_update`                               | Patch status/content for existing `toolCallId`                                             | Yes (281–316)                                                                 | Updates existing `tool_call` (or inserts stub)         |
| `plan`                                           | Full plan entry list replace                                                               | Yes (234–241)                                                                 | `plan` (appends; does **not** replace prior plan item) |
| `plan_update` / `plan_removed`                   | Unstable plan variants in schema (~5082–5098)                                              | No                                                                            | Dropped                                                |
| `available_commands_update`                      | Slash commands ready                                                                       | Explicit no-op in reducer (220–222); side-parsed in `agentHarness.ts` 200–203 | Not a chat item                                        |
| `usage_update`                                   | Context size / cost                                                                        | Explicit no-op in reducer (220–222); side-parsed via `parseUsageUpdate`       | Not a chat item (usage popover)                        |
| `config_option_update`                           | Config selectors changed                                                                   | Yes (224–231)                                                                 | `config_options`                                       |
| `session_info_update`                            | Title / timestamps                                                                         | Yes (244–256)                                                                 | `session_info`                                         |
| `current_mode_update`                            | Mode change                                                                                | No                                                                            | Dropped                                                |
| `compaction_update` / `compaction_summary_chunk` | Unstable compaction                                                                        | No                                                                            | Dropped                                                |

Notes:

- Tool **kinds** (`read` / `search` / `execute` / `think` / …) are protocol hints for icons/UX ([tool-calls.md](https://agentclientprotocol.com/protocol/v1/tool-calls.md)); desktop stores `toolKind` but only prints `kind: …` text (`ChatItemView.tsx` 122–126).
- Schema / docs for tool calls and message chunks expose **no elapsed-ms / “worked for” field**. Duration labels in screenshots are client-measured.
- “Explored N files” labels are also not protocol fields; closest inputs are tool `kind` + `title` / locations content.

## Current apps/desktop behavior

### Flat `ChatItem` model

```29:48:apps/desktop/src/acp/sessionUpdateReducer.ts
export type ChatItem =
  | { readonly entries: readonly PlanEntry[]; readonly id: string; readonly kind: 'plan' }
  | { readonly id: string; readonly kind: 'agent_message'; readonly text: string }
  | { readonly id: string; readonly kind: 'config_options'; readonly options: readonly ConfigOption[] }
  | {
      readonly id: string;
      readonly kind: 'session_info';
      readonly title?: string;
      readonly updatedAt?: string;
    }
  | {
      readonly id: string;
      readonly kind: 'tool_call';
      readonly resultText?: string;
      readonly status: string;
      readonly title: string;
      readonly toolCallId: string;
      readonly toolKind?: string;
    }
  | { readonly id: string; readonly kind: 'user_message'; readonly text: string };
```

There is **no** `thought` / `work_group` kind. Unknown `sessionUpdate` values (including `agent_thought_chunk`) return the accumulator unchanged (`sessionUpdateReducer.ts` 331–332).

### Reducer → harness → UI

- `agentHarness.ts` 156–165 / 196–198: every `session/update` runs `reduceSessionUpdate`, then pushes `chatItems` to UI callbacks.
- `AgentChatMain.tsx` 114–121: renders `chatItems.map(item => <ChatItemView …/>)` — one list row per item, no grouping.
- `ChatItemView.tsx` 111–135: `tool_call` is a full `Paper` with title, status `Chip`, optional `kind`, optional `resultText` — **always expanded**, no Accordion/Collapse.

### Tests

- Unit tests cover bootstrap/config normalization (`acpSessionBootstrap.test.ts`), **not** `sessionUpdateReducer` / chat rendering.
- Integration coverage of update kinds lives in `libs/effect-acp` + `jsonrpc-echo` fixtures (plan / tool_call / agent_message_chunk), still without thoughts UI.

### MUI already in the Harness UI

- `Accordion` + `AccordionSummary` + `AccordionDetails` with `disableGutters` / `elevation={0}`: `RpcWireLogPanel.tsx` 1–3, 94–135.
- `ListItemButton`: `SessionRosterPanel.tsx` (roster selection, not chat collapse).
- Theme has `MuiListItemButton` overrides (`apps/desktop/src/theme/theme.ts` ~351).
- Chat list itself uses `List` / `ListItem` / `Paper` / `Chip` only (`ChatItemView.tsx`, `AgentChatMain.tsx`).

## Emulation options

### A. Pure UI collapse around existing flat items (recommended)

**Idea:** In `AgentChatMain` (or a tiny `groupChatItemsForView` helper), segment the flat array into:

- pass-through: `user_message`, `agent_message`, `session_info`, `config_options`
- **work run:** maximal consecutive run of `tool_call` (optionally include adjacent `plan`)

Wrap each work run in one `Accordion` summary like `N tool calls` (or `Work` while any status ∈ {pending, in_progress}).

| Pros                                               | Cons                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Smallest diff; no reducer/`ChatItem` churn         | No true “Thought” rows until thoughts are reduced                                                                                |
| Reuses existing Accordion pattern in same package  | “Worked for Ns” needs a client timer (not ACP)                                                                                   |
| Directly achieves “hide the work, show the answer” | Naive consecutive grouping mishandles interleaved agent_message-in-the-middle-of-tools (common in real turns — see `…10.33.30…`) |

**Mitigation for interleaving:** treat `agent_message` as “answer” only when it is the **last** item of a turn _or_ when followed only by non-work kinds; alternatively group **all** `tool_call`/`plan` between two user messages into one work accordion and leave mid-turn agent text outside (still visible). Good enough for v1.

### B. Reducer / view-model `work_group` turn segment

Introduce `ChatItem` kind `work_group` (or parallel view-model) that owns child tool/thought ids, duration, summary label.

| Pros                                          | Cons                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| Cleaner streaming rules, easier tests         | Larger surface: reducer, harness callbacks, atoms, views |
| Natural home for duration + “Explored…” later | YAGNI for “hide work” alone                              |

### C. Richer per-item Accordion without grouping

Each `tool_call` becomes its own Accordion (like RPC wire log rows).

| Pros                | Cons                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| Trivial mapping 1:1 | Still a long list of headers — fails the harness “one Worked for Ns” bar |
|                     | Does not match Cursor/T3 collapsed end-state                             |

### Recommendation

Ship **A**. Add **B** only if product needs nested thought groups, durable open/closed state across remount, or shared non-React consumers of a grouped model. Skip inventing Cursor “Explored N files” until A is shipped and feels insufficient.

## Concrete mapping (recommended)

| Layer                      | Change?       | Detail                                                                                                                                                 |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessionUpdateReducer.ts`  | **No** (v1)   | Keep flat items. Optional follow-up: handle `agent_thought_chunk` → `kind: 'agent_thought'` mirroring `agent_message` chunking.                        |
| `agentHarness.ts`          | **No**        | Still feeds flat `chatItems`. Optional: stamp `Date.now()` on prompt send / last update for duration UI.                                               |
| `AgentChatMain.tsx`        | **Yes**       | Replace bare `map` with segmented render; one Accordion per work run.                                                                                  |
| New tiny helper (optional) | **Yes**       | `groupChatItems(items) → Array<ChatItem \| { kind: 'work_run'; items: ChatItem[] }>` — pure function, easy unit test.                                  |
| `ChatItemView.tsx`         | **Minimal**   | Keep item renderers; maybe denser tool row when nested under a work Accordion (title + chip only; put `resultText` behind nested Accordion **later**). |
| `RpcWireLogPanel.tsx`      | Reuse pattern | Copy Accordion styling (`disableGutters`, hide `::before`, dense summary) — already lines 94–102.                                                      |

### Default open/closed behavior (product)

| State                                                                     | Suggested UI                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Turn streaming / any tool `pending`/`in_progress`                         | Work Accordion **expanded** (or at least summary shows live “Working…”) |
| All tools terminal (`completed`/`failed`/`cancelled`) and prompt returned | Work Accordion **collapsed**                                            |
| User toggled                                                              | Respect controlled `expanded`                                           |

MUI primitives: `Accordion` `defaultExpanded` / controlled `expanded` + `onChange` ([MUI Accordion docs](https://llms.mui.com/material-ui/9.4.0/react-accordion.md); API `defaultExpanded` default `false` in [Accordion API](https://llms.mui.com/material-ui/9.4.0/api/accordion.md)). For nested detail without full Accordion chrome, `Collapse` `in` prop ([Collapse API](https://llms.mui.com/material-ui/9.4.0/api/collapse.md)). Desktop already depends on `@mui/material` Accordion in-package.

### What stays out of v1

- Invented “Explored N files” copy
- Pixel-perfect Cursor tool rows / “Show fewer”
- Protocol changes / `_meta` duration fields
- Rewriting plan replace semantics (current reducer appends plans)

## Open questions / non-goals

**Non-goals (this research / first UX cut)**

- Matching every harness visual (pills vs plain text, blue borders, skill icons).
- Implementing unstable schema variants (`plan_update`, compaction, …).
- Treating mid-turn `agent_message_chunk` as “thought” via NLP heuristics.

**Open questions**

1. **Duration (“Worked for Ns”):** ACP does not define it. Measure client-side from `session/prompt` send until stopReason / last work update? Accept “N tool calls” label with no clock for v1?
2. **Thoughts:** When agents emit `agent_thought_chunk`, should thoughts join the work Accordion (yes) or remain visible like T3’s one-liner outside nested tool group (`…10.33.15…`)?
3. **Interleaved agent text + tools:** Group only tools, or also demote early agent_message into work when later tools appear?
4. **Streaming expand:** Auto-expand while in progress then auto-collapse on turn end — or leave expanded until user collapses (less surprising, more scroll)?
5. **Plans:** Include `plan` items inside the work group or keep as always-visible checklist?
6. **Permissions / elicitation:** Out of chat-item model today; if surfaced later, do they belong inside the work accordion?

## Sources

### Protocol / schema

- https://agentclientprotocol.com/llms.txt
- https://agentclientprotocol.com/protocol/v1/overview.md
- https://agentclientprotocol.com/protocol/v1/prompt-turn.md
- https://agentclientprotocol.com/protocol/v1/tool-calls.md
- https://agentclientprotocol.com/protocol/v1/agent-plan.md
- https://agentclientprotocol.com/protocol/v1/content.md
- `@agentclientprotocol/sdk@1.4.0` `schema/schema.json` (`SessionUpdate` discriminators ~4986–5210, including `agent_thought_chunk` ~5018)

### Repo

- `apps/desktop/src/acp/sessionUpdateReducer.ts`
- `apps/desktop/src/components/mainChat/ChatItemView.tsx`
- `apps/desktop/src/components/mainChat/AgentChatMain.tsx`
- `apps/desktop/src/acp/agentHarness.ts`
- `apps/desktop/src/components/wireLog/RpcWireLogPanel.tsx`
- `apps/desktop/src/components/leftPanel/SessionRosterPanel.tsx`
- `libs/effect-acp/CONTEXT.md` (session update vocabulary)

### MUI

- https://llms.mui.com/material-ui/9.4.0/react-accordion.md
- https://llms.mui.com/material-ui/9.4.0/api/accordion.md
- https://llms.mui.com/material-ui/9.4.0/api/collapse.md

### Screenshots (research attachments)

- Codex-style work tree / collapsed: `Screenshot_2026-09-02_at_10.32.15_PM-25dec4cd-cdff-4bd9-be4f-6da78b7b1533.png`, `…10.32.24…4096c9d9…`, `…10.32.39…614b2f19…`, `…10.32.45…a8ff9786…`
- Cursor collapsed / expanded / truncated: `…10.35.40…aa1aae16…`, `…10.36.09…96317126…`, `…10.35.48…50be22c8…`
- T3-style pill + nested tools: `…10.32.56…550d960f…`, `…10.33.02…fb837ad7…`, `…10.33.15…0c0bbe1f…`
- `apps/desktop` before (flat tools): `…10.33.48…6d56fd84…`, `…10.33.30…e1b8e33e…`, `…10.33.35…7d6ee94d…`

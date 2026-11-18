# ACP `_meta.jetbrains.air` capabilities: what each does, what hoa uses, what to build next

Date: 2026-11-18
Question: What does each capability in the ACP `initialize` response `_meta.jetbrains.air.capabilities` do, for Claude (`@agentclientprotocol/claude-agent-acp` 0.103.0) and Codex (`@agentclientprotocol/codex-acp` 2.6.0)? Which of them does hoa already use? Which unimplemented ones are worth building, and in what order?

Related: [`2026-09-09-acp-meta-props-by-agent.md`](./2026-09-09-acp-meta-props-by-agent.md) lists the `_meta` keys seen on the wire with older adapters (codex-acp 1.8.0, claude-agent-acp 0.73.0). This note goes deeper on the `jetbrains.air` namespace, using the current runtimes.

## Summary

- **Key path.** The key is `initialize` result `_meta.jetbrains.air`. It is nested objects (`{ jetbrains: { air: { version: 1, capabilities: [...], goal: {...} } } }`), not a dotted key. "AIR" is the ACP client that JetBrains builds. Both adapters implement AIR extensions as opt-in vendor extensions and document them in `docs/air-extensions.md` (Claude [v0.103.0](https://github.com/agentclientprotocol/claude-agent-acp/blob/v0.103.0/docs/air-extensions.md), Codex [v2.6.0](https://github.com/agentclientprotocol/codex-acp/blob/v2.6.0/docs/air-extensions.md)). Neither doc is in the npm tarball. Both were fetched at the matching git tag.
- **Negotiation is two-sided.**
  - A client becomes "AIR" as soon as it sends any object at `initialize.clientCapabilities._meta.jetbrains.air`. That alone unlocks a set of AIR-only `_meta` keys and AIR-specific wire shapes.
  - Each listed capability is active only when the client also names it in `clientCapabilities._meta.jetbrains.air.capabilities` with `version >= 1`.
  - The agent list mostly says "I can do X if you ask." Only the `sessionIndex` family is advertised conditionally.
- **hoa is already an AIR client** for both providers. `clientCapabilitiesFor` sends `_meta.jetbrains.air = { version: 1, capabilities: ["sessionIndex"] }` (`libs/ui/src/host/agentCapabilities.ts:118-125`). As a result:
  - hoa gets the AIR tool-call contract, the AIR subagent form, AIR-only `_meta` keys, and the session index.
  - Of the advertised capabilities, it consumes only `sessionIndex` (archived filter, archive, unarchive, rename).
  - It also uses `planFilePath` and `nativeSubagentSessions` behaviour without declaring them.
- **Pagination gap.** Because hoa declares `sessionIndex` but sends no `list.limit` and never follows `nextCursor`, each `session/list` returns at most **50** rows per provider (the default `DEFAULT_LIST_LIMIT = 50` in both adapters).
- **Top 3 to build:**
  1. Finish the session index: paginate, read the row metadata hoa already receives, and use `_session/list/subscribe`.
  2. `sessionFailure`: typed, revisable error and warning rows in place of raw JSON-RPC errors and `Warning:` text.
  3. `loadReplayEnd` (Claude): an exact "replay complete" signal for the #278 load replay work. It lets hoa show the full history before the slow CLI start finishes, and keep a complete replay when the load fails afterwards.

## Method

- **Claude runtime** at `~/.hoa/providers/claude-agent-acp/runtime/0.103.0/node_modules/@agentclientprotocol/claude-agent-acp/dist/`. Read `air-extension.js`, `v1/acp-agent.js` (initialize at L794-850), `acp-subagents.js`, `file-change-audit.js`, `client-system-prompt.js`, `native-subagents.js`, `v1/session-index/*`, and `v2/air.d.ts`.
- **Codex runtime** at `~/.hoa/providers/codex-acp/runtime/2.6.0/node_modules/@agentclientprotocol/codex-acp/dist/index.js`. This is a single esbuild bundle (≈2.1 MB of plain JS, not a native binary). Read the `src/AirExtension.ts` region (L32531-32610), `initializeExtensionsMeta` (L51155-51200), `src/subagents/AcpSubagents.ts` (L47925-47932), and the session-index region (L48230-48600, L50074-50082).
- **Upstream contracts.** Fetched `docs/air-extensions.md` for both adapters at the matching tags (`gh api repos/agentclientprotocol/{claude-agent-acp,codex-acp}/contents/docs/air-extensions.md?ref=<tag>`).
- **Scope.** The coordinator supplied the `initialize` responses that hoa observed, and those lists define the scope here. Every name in them was checked against code.
- **hoa.** Grepped `apps/` and `libs/` (excluding `node_modules`, `.agents/`, build output) for `jetbrains`, `air`, every capability name, and every method or key name they introduce.

## What is negotiated (both sides)

Client declaration (`initialize` request):

```json
{ "clientCapabilities": { "_meta": { "jetbrains": { "air": { "version": 1, "capabilities": ["sessionIndex"] } } } } }
```

Acceptance rule. The code is identical in both adapters (Claude `air-extension.js:141-150`, Codex `index.js:32597-32603`):

```js
return (
  typeof version === 'number' &&
  Number.isInteger(version) &&
  version >= AIR_EXTENSION_VERSION &&
  Array.isArray(advertised) &&
  advertised.includes(capability)
);
```

AIR identity is a separate, looser check: any object at `_meta.jetbrains.air` (Claude `air-extension.js:118-120`, Codex `index.js:32591-32596`). Agent declaration is the `initialize` result top-level `_meta`, sent only to an AIR client. Claude builds it at `v1/acp-agent.js:839-848`, Codex at `index.js:51160-51199`.

### Claude vs Codex matrix

Columns:

- **Adv** = listed in the agent's `capabilities` array (the observed responses).
- **Honors if client declares** = the code acts on the client's declaration even if the agent does not list it.
- **Gate** = what turns it on.

| Capability                        | Claude Adv                 | Codex Adv                                   | Claude honors if declared                                                     | Codex honors if declared                              | Gate                                              |
| --------------------------------- | -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `sessionFailure`                  | yes                        | yes                                         | yes                                                                           | yes                                                   | client declares                                   |
| `agentFileChangeReport`           | yes                        | yes                                         | yes                                                                           | yes                                                   | client declares, plus a per-prompt request object |
| `customInstructions`              | yes                        | yes                                         | read from `session/new` `_meta` **without** a declaration (appends to preset) | same gate; sets `developerInstructions`               | none (session-setup `_meta`)                      |
| `nativeSubagentSessions`          | yes                        | yes                                         | yes (or `clientCapabilities.subagents`)                                       | yes (or AIR + `subagents` on v1)                      | client declares or uses the std field             |
| `asyncTasks`                      | yes                        | yes                                         | yes                                                                           | yes                                                   | client declares                                   |
| `recommendedValue`                | yes                        | yes                                         | yes                                                                           | yes                                                   | client declares                                   |
| `diffPatch`                       | yes                        | yes                                         | yes                                                                           | yes                                                   | client declares                                   |
| `planFile`                        | **yes**                    | no                                          | yes                                                                           | n/a (Codex streams plans)                             | client declares                                   |
| `backgroundSubagents`             | **yes**                    | no                                          | yes (ACP v1 only)                                                             | n/a (`grep -c` = 0)                                   | client declares                                   |
| `rawInputRendering`               | no                         | **yes**                                     | **yes** (doc: "Advertised: no")                                               | yes                                                   | client declares                                   |
| `planContentDelta`                | no                         | **yes**                                     | ignored ("The adapter ignores `planContentDelta`")                            | yes                                                   | client declares                                   |
| `codexHooks`                      | no                         | **yes**                                     | n/a                                                                           | methods registered unconditionally (`index.js:55690`) | agent-advertised only                             |
| `loadReplayEnd`                   | no                         | no                                          | **yes** (`acp-agent.js:6372`)                                                 | no (`grep -c loadReplayEnd` = 0)                      | client declares                                   |
| `sessionIndex`                    | yes (only if declared)     | yes (only if declared)                      | yes                                                                           | yes                                                   | client declares                                   |
| `sessionBatchGet`                 | with `sessionIndex`        | with `sessionIndex`                         | (no client declaration)                                                       | (no client declaration)                               | follows `sessionIndex`                            |
| `sessionArchive`                  | with `sessionIndex`        | with `sessionIndex`                         | "                                                                             | "                                                     | "                                                 |
| `sessionRename`                   | with `sessionIndex`        | with `sessionIndex`                         | "                                                                             | "                                                     | "                                                 |
| `sessionListSubscribe`            | with `sessionIndex`        | with `sessionIndex`                         | "                                                                             | "                                                     | "                                                 |
| `sessionWorktrees`                | with `sessionIndex`        | with `sessionIndex`                         | "                                                                             | "                                                     | "                                                 |
| `goal` (object, not a capability) | `actions: ["set","clear"]` | `actions: ["set","pause","resume","clear"]` | —                                                                             | —                                                     | AIR identity; client calls `_session/goal`        |

Sources:

- Claude: `v1/acp-agent.js:841` (advertised list), `air-extension.js:1-58` (constants).
- Codex: `index.js:51161-51180` (lists differ for ACP v1 and v2), `index.js:35871-35874` (goal).
- Upstream docs: Claude §Capabilities, Codex §Capabilities.

Notes on the matrix:

- **`customInstructions`, Claude doc vs code.** Claude's own doc example (§Agent declaration) omits it, but the code at `acp-agent.js:841` includes it, and the observed response confirms that. The code wins, and the upstream doc is stale on this point.
- **Codex on ACP v2.** Codex drops `diffPatch`, `rawInputRendering`, `planContentDelta` and `codexHooks` from its list on v2 (`index.js:51174-51181`). hoa speaks v1.
- **Claude on ACP v2.** Claude's v2 core advertises only `agentFileChangeReport` and `recommendedValue` (`v2/air.js:28`).
- **Related sibling keys, briefly:**
  - `_meta.steering: { supported: true }` (both). This advertises `_session/steering`.
  - `agentCapabilities._meta.authStatus: {}` (both). The agent pushes `_auth/status_update`.
  - `agentCapabilities._meta.claudeCode.promptQueueing: true` (Claude only).
  - These are not AIR-gated (Claude `acp-agent.js:797-806, 848-850`).

## Per-capability breakdown

Each entry has four parts: what the agent says, the wire change, what the client must do, and the behaviour with and without the capability. "Claude doc" and "Codex doc" mean the two `air-extensions.md` files at the tags above.

### `sessionFailure`

- **Wire.**
  - Errors and warnings become durable transcript records at `_meta.jetbrains.air.sessionFailure = { id, revision, category, severity, title, details?, reason?, actions[] }`.
  - A turn-terminal failure arrives on `PromptResponse._meta` with `stopReason: "end_turn"`.
  - Session-scoped incidents, retry warnings, background incidents and notices arrive in a `session_info_update`.
- **Client duties.**
  - Declare the capability.
  - Create one transcript entry per `id`, and update it in place when `revision` is higher. Ignore equal or lower revisions.
  - Show `title`.
  - Offer the known actions (`retry`, `login`, `new_session`). Ignore unknown ones, and never infer actions from `category`.
- **Without it.**
  - JSON-RPC errors and plain transcript text, unchanged.
  - Codex additionally sends `Warning:` / `Config warning:` text chunks and `session_info_update._meta.codex.error`.
- **Claude vs Codex.**
  - Same record. Claude also sets `reason` and handles history replay of usage-limit messages.
  - Codex maps its own error enum (`usageLimitExceeded`, `contextWindowExceeded`, ...).
  - In both, auth failures still end with ACP `authRequired`.
  - When the client also declares `clientCapabilities.session.notices`, notices go out as ACP `notice` instead.
- Sources: Claude doc §Session failure, `session-failure-extension.js:5,86,155`; Codex doc §Session failure, `index.js:50741`.

### `agentFileChangeReport`

- **Wire.**
  - The client adds `_meta.jetbrains.air.agentFileChangeReportRequest = { version: 1, requestId }` to `session/prompt`.
  - Before the `PromptResponse`, the agent sends one `session_info_update` with `_meta.jetbrains.air.agentFileChangeReport = { version, requestId, status: "reported"|"unavailable", paths[], declaredComplete: false, truncated, reason?, uncertainty? }`.
- **Client duties.** Declare the capability and send a unique `requestId` per prompt. The id must match `[A-Za-z0-9._:-]{1,128}` and the request object must have exactly those two keys. Match the report by id, and drop duplicate, stale or unavailable reports.
- **Without it.** Nothing is sent.
- **Claude vs Codex.**
  - Claude enables SDK file checkpointing and dry-runs a rewind at turn end, with a 2 s timeout. That covers the Claude file tools, but not Bash or most subagents.
  - Codex uses the final aggregated `turn/diff/updated`, which covers only `apply_patch` changes, and adds an `uncertainty` string.
  - Both always send `declaredComplete: false`.
- Sources: Claude doc §Agent file-change report, `file-change-audit.js:4-31`; Codex doc §Agent file-change report, `index.js:37855-37857, 50744`.

### `customInstructions`

- **Wire.** The client puts a string at `session/new` (and `session/load`) `_meta.jetbrains.air.customInstructions`.
  - Claude appends it to the `claude_code` preset system prompt (`client-system-prompt.js:33-63`; read at `v1/acp-agent.js:7494`).
  - Codex reads it at `index.js:42437, 43217-43221` and keeps the previous value across loads.
    - At session creation without a client `systemPrompt`, Codex uses it as the thread's `developerInstructions`. That replaces the configured `developer_instructions` rather than appending to a preset.
    - With a client `systemPrompt`, it becomes the baseline in place of the configured `developer_instructions` (`index.js:43215-43222`).
    - So the two adapters differ in meaning: Claude appends, while Codex sets the developer instructions.
- **Gate.** Neither adapter checks the client's capability list or an `airClient` flag for it: `airCustomInstructions` reads `_meta` directly in both (Claude `air-extension.js:153-157`, Codex `index.js:32604-32610`). The agent lists it only so that AIR knows the key is honoured.
- **Neither upstream doc has a section for it.** The behaviour above is from code only.

### `nativeSubagentSessions`

- **Wire.**
  - Subagents become child ACP sessions, announced on the parent session with `subagent_spawned { subagentSessionId, name, task, prompt?, capabilities: {} }` and finished with `subagent_state_update { subagentSessionId, state }`.
  - This is the earlier draft of [ACP RFD #1992](https://github.com/agentclientprotocol/agent-client-protocol/pull/1992).
  - Child output goes to the child session id.
  - Claude: `native-subagents.js:1402-1440`.
- **Gate (important for hoa).**
  - Claude: `subagentForm` returns `"air"` when the client supports subagents (`clientCapabilities.subagents: {}` **or** the AIR capability) **and** is an AIR client. Otherwise the revised RFD form (`subagent_update`, `session_message`) is used (`acp-subagents.js:4-15`).
  - Codex: `subagentProtocol` returns `"air"` when the AIR capability is declared, or on v1 with AIR identity plus standard `subagents`. AIR without either gives `"hidden"` (`index.js:47926-47932`).
- **Without it.** Subagents remain ordinary tool calls. AIR gets `_meta.jetbrains.air.subagent: true` on them.

### `asyncTasks`

- **Wire.**
  - New `session/update` kinds: `async_task_spawned { asyncTaskId, name, taskType, description, showInTranscript, canStop, outputFilePath?, toolCallId? }`, `async_task_progress` (changed fields only), and `async_task_state_update { state: running|paused|completed|failed|stopped, summary? }`.
  - The Bash or command `tool_call_update` gets `_meta.jetbrains.air.asyncTasks.backgrounded: true`.
  - Stop request: `_session/async_task/stop { sessionId, asyncTaskId }` returns `{ stopped }`.
- **Claude.**
  - Covers backgrounded Bash and workflows, but not subagents (those use native sessions) and not Monitor.
  - When a turn starts itself after the prompt ends, it is published as a task `autonomous-turn-<uuid>` (`taskType: "turn"`, `showInTranscript: false`). Stopping that task interrupts the turn.
  - Sources: Claude doc §Async tasks, `async-tasks.js:19`, `tool-calls/background.js:33`.
- **Codex.**
  - Covers only background terminal commands, from `thread/backgroundTerminals/list`.
  - Stop calls `thread/backgroundTerminals/terminate`.
  - Sources: Codex doc §Async tasks, `index.js:47458, 50536-50538`.
- **Without it.** No task updates.

### `recommendedValue`

- **Wire.** The `model` and effort config options (`reasoning_effort` in Codex) carry `_meta.jetbrains.air.recommendedValue: "<option value>"`. The value is independent of `currentValue`.
- **Claude.**
  - Removes the ambiguous `default` model and effort rows. It replaces them with the concrete `resolvedModel`, and recommends `medium` effort.
  - It also applies the shown effort to the SDK, so the picker matches reality.
  - Sources: `session-model.js:238`, `session-effort.js:115`, `session-config-options.js:65`.
- **Codex.**
  - Only annotates. The recommended model is the one marked `isDefault`, and the effort is that model's `defaultReasoningEffort` (`index.js:36290, 36307`).
- **Without it.** The old option shape, including the `default` rows (Claude).

### `diffPatch`

- **Wire.**
  - An ACP `diff` content block carries `_meta.jetbrains.air.diffPatch = { version: 1, format: "git_patch", text }`. The placeholders `oldText: null` and `newText: ""` must not be rendered as an empty file.
  - It falls back to a standard diff when no exact patch is possible: files over 1 MiB, binary files, CR bytes, and similar.
- **Claude.** Previews the patch in the permission request for Edit/Write, and sends the exact patch after the write (`diff.js:585`).
- **Codex.** One `diff` block per changed file of a `fileChange` (`index.js:35067`).
- **Without it.** Standard `oldText`/`newText`.

### `planFile` (Claude only)

- **Wire.** ExitPlanMode `rawInput` becomes `{ planFilePath }` with **no plan text** in `rawInput` or `content`. The permission title becomes "Ready to code?". The plan id is `plan-mode:<toolCallId>`.
- **Without it.** `rawInput` is the SDK input with `plan` text, **and `planFilePath` too when the CLI wrote a plan file** (Claude doc §Plan file → Fallback).
- **Codex.** Never uses it, because Codex keeps plans as text (Codex doc §Plan stream).

### `backgroundSubagents` (Claude only)

- **Without it** (the "hold"):
  - `session/prompt` stays open while a subagent that the turn started or resumed is still running.
  - Subagent output, permission requests and the model's follow-up summary go out inside the turn.
- **With it:**
  - The turn ends at its result (`end_turn`).
  - Subagent updates, permission requests and elicitations arrive **after** the prompt response.
  - The follow-up cycle is autonomous.
  - A steer with no turn in flight starts a turn, or returns `promptRequired`.
  - `session/cancel` with no turn interrupts and cancels native subagent sessions.
  - ExitPlanMode from a follow-up cycle arrives outside any turn and has no clear-context option.
- ACP v1 only. Source: Claude doc §Background subagents, `v1/acp-agent.js:677-685`.

### `rawInputRendering` (Codex advertises it; Claude honours it too)

- **What it does.** Removes the "display copy" of human-readable input from `content`. Examples: the plan to approve, the subagent prompt, questions, command descriptions, the fetch prompt, the Guardian action. The client must render `rawInput` itself.
- **Without it.** One display copy is put in `content`.
- Sources: Claude `tool-calls/client-capabilities.js:44`; Codex `index.js:35966`.

### `planContentDelta` (Codex only)

- **Wire.** Codex's Markdown plan in plan mode streams as `plan_update { plan: { type: "markdown", planId, content } }`.
  - With the capability, the first report has the full text. Later reports have `content: ""` plus the appended text in `_meta.jetbrains.air.contentDelta`.
  - Without it, each report is a full snapshot.
- **Prerequisite.** Requires the client to also declare draft `clientCapabilities.plan`. AIR without plan updates gets the plan as an `agent_message_chunk`.
- Claude explicitly ignores it.
- Sources: Codex doc §Plan content delta, `index.js:35770, 35967`.

### `codexHooks` (Codex only)

- **What it advertises.** Codex supports `_codex/hooks/list { cwd }` and `_codex/hooks/trust { cwd, hooks: [{ key, currentHash }] }` (`index.js:47953-47954`). These let the client review and trust `CODEX_CONFIG.hooks` startup hooks before a session opens.
- **Trust storage.** Trust is written to `hooks.state."<key>".trusted_hash` in `$CODEX_HOME/config.toml`, which is shared by all projects.
- **Gate.** Agent-advertised only. There is no client declaration.

### `loadReplayEnd` (client-declared; Claude only)

- **Wire.** After the whole `session/load` history replay, including child-session subagent history, and before the `session/load` response, the agent sends one `session_info_update { _meta: { jetbrains: { air: { version: 1, loadReplayEnd: true } } } }` with no `title` and no `updatedAt`.
- **Not sent:**
  - when the replay stops or fails;
  - for live updates;
  - to a client that did not declare it.
- **Can still fail after it.** `session/load` can still fail after the marker arrives, for example when the CLI start fails.
- Sources: Claude doc §Load replay end, `v1/acp-agent.js:6369-6382`.

### `sessionIndex` and its five companions

- **Activation.** The client declares `sessionIndex`. The agent then also lists `sessionBatchGet`, `sessionArchive`, `sessionRename`, `sessionListSubscribe` and `sessionWorktrees`. The client never declares those five. Sources: Claude `v1/session-index/connection.js:41-67`; Codex `index.js:50074-50082`.
- **`session/list`:**
  - Request `_meta.jetbrains.air.list = { limit?, includeWorktrees?, archived?: "unarchived"|"archived"|"all" }`.
  - `limit` defaults to **50**. It is clamped to 200 by Claude and 100 by Codex (Claude `session-index.js:30-31`; Codex `index.js:48250`).
  - Rows are ordered by last prompt and returned with an opaque `nextCursor`.
  - Each row has `_meta.jetbrains.air = { archived, lastPromptAt?, model?, forkedFrom?, agentWorktree?, state?, lastTurnEndedAt?, cost? }`. Codex sends no `cost`, and its `state` is known only for threads it has loaded.
- **`_session/rename { sessionId, title }`.** Returns `{}`. A loaded session then gets `session_info_update { title }`.
- **`_session/archive` / `_session/unarchive { sessionId }`:**
  - Idempotent.
  - Archive **stops** a session loaded on this connection.
  - A loaded session gets `session_info_update._meta.jetbrains.air.archived`.
  - Claude stores the state as an `[archived] ` title prefix, shared with AIR's native Claude path.
- **`_session/batch_get { sessionIds }`.** Returns `{ sessions: [...] }` with full rows for known ids (pinned, or outside the page).
- **`_session/list/subscribe { cwd }`:**
  - Returns `{ subscriptionId }`, then `_session/list/changes { subscriptionId, sessions[], removed[] }` notifications. Delivery is best effort and debounced, at most once per second per session.
  - `_session/list/unsubscribe`.
  - Limit: 128 subscriptions per connection.
- **`session/delete`.**
  - For a `sessionIndex` client, Claude really deletes the transcripts.
  - For an AIR client _without_ `sessionIndex`, Claude archives instead (Claude doc §Delete and close).
- **Without `sessionIndex`.** The old `session/list` (Claude pages of 1000, `offset:N` cursors, no row `_meta`). The new methods answer `-32601`.
- **ACP RFDs.** The index maps onto the "Session list extensions" RFD, [#2161](https://github.com/agentclientprotocol/agent-client-protocol/pull/2161) (archive) and [#1987](https://github.com/agentclientprotocol/agent-client-protocol/pull/1987) (set title). See Claude doc §Relation to the RFDs.

### `goal` (sibling object, not a capability)

- **Wire.** `_session/goal { sessionId, action, objective? }`. Snapshots arrive in `session_info_update._meta.jetbrains.air.goal`: `{ objective, status: active|paused|blocked|limited|complete, ... }`, or `null` when the goal is cleared.
- **Lifecycle.** A goal outlives individual prompts and can drive autonomous cycles after a prompt completes.
- **Claude.** Only `set` and `clear`. It maps onto the `/goal` Stop-hook.
- **Codex.** Also `pause` and `resume`. It maps `thread/goal/*` and reports token and time usage.
- **Gate.** AIR identity. Codex also accepts the legacy method `_codex/session/goal_control`.

## AIR-identity effects (no capability needed)

These apply to hoa today because it sends `_meta.jetbrains.air`. Sources: Claude doc §AIR metadata keys and §Claude tools and ACP fields; Codex doc §AIR metadata keys and §Codex items and ACP fields.

- **AIR-only `_meta` keys.**
  - Tool calls: `commandTitle` (Claude Bash/PowerShell), `subagent: true`, `skill` (Claude), `mcp` (Claude).
  - Context compaction: `contextCompaction`.
  - Requests: `permission` on `session/request_permission`, and `customAnswer` on elicitation fields (plus the legacy root `_askUserQuestionCustomAnswer`).
  - Modes and commands: `kind` on modes and mode config values (`standard|plan|auto_review|full_access`), `kind: "skill"` and `skillPath` on available commands, and `commandAction` (Codex).
  - Messages: `phase` on Codex agent message chunks.
  - Session updates: `goal` snapshots, and `promptSuggestions` (Claude, `session_info_update._meta.promptSuggestions`).
- **Tool-call contract.**
  - Each fact appears in only one field.
  - Claude Edit/Write `rawInput` loses `old_string`, `new_string` and `content`, because the diff holds them.
  - `claudeCode.toolResponse` is reduced to `status` and `isAsync`.
  - For AIR, unchanged `_meta` keys on `tool_call_update` are dropped (Claude `ChangedMetaClient`, `v1/acp-agent.js:525, 688`).
  - hoa does not read tool-call `_meta` (no `claudeCode` or `parentToolUseId` hits under `libs/ui/src`), so the dropped keys do not affect it.
  - For AIR, Claude sends `rawOutput` only when no other field carries the result, and the first `tool_call` no longer gets `rawInput: {}`. This does not affect hoa: it takes `resultText` from `content` (`sessionUpdateReducer.ts:647, 666`) and reads only `rawInput.command` / `rawInput.planFilePath` from `rawInput`.
- **Subagent form.** Both adapters send the AIR draft form (`subagent_spawned` / `subagent_state_update`) rather than the revised RFD form, because hoa also sends `clientCapabilities.subagents: {}` (see the `nativeSubagentSessions` gate above).
- **Claude hold.** As an AIR client without `backgroundSubagents`, hoa gets the hold: the prompt turn stays open while background subagents run.

## What hoa implements today

Legend:

- **Full** = declared (if needed) and the wire is consumed end to end.
- **Partial** = some of the wire is consumed, or the behaviour is relied on without declaring.
- **None** = nothing consumed.

| Capability / key                         | Status                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AIR identity                             | declared (Claude, Codex)         | `PROVIDER_QUIRKS.airClient` `libs/ui/src/host/agentCapabilities.ts:60-65`; `clientCapabilitiesFor` `:118-125`; envelope builder `libs/ui/src/host/airMeta.ts:13-20`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sessionIndex`                           | **Partial**                      | Declared (`agentCapabilities.ts:120`). Every list sends `list.archived: "all"` (`libs/ui/src/host/sessionListScope.ts:11-21`, `libs/ui/docs/adr/0008-show-archived-filters-in-app.md`, schema `libs/effect-acp/src/schema/agent.ts:44-58`). Rows are filtered by `archived` (`airMeta.ts:23-29`). **No `limit` and no `nextCursor` follow-up** (`libs/ui/src/host/backendHarness.ts:164-168`, `libs/ui/src/host/sessionRpc.ts:126-129`), so at most 50 rows per provider. `pinnedSessions.ts:18-21` skips its sweep on a partial page. Row `state`, `lastPromptAt`, `model`, `cost`, `forkedFrom`, `agentWorktree` are not read (no hits). |
| `sessionArchive`                         | **Full**                         | Capability read `agentCapabilities.ts:91`. Methods `libs/effect-acp/src/schema/agent.ts:65-69, 399-411`, `libs/effect-acp/src/AcpConnection.ts:202-225, 362-366`. Calls `libs/ui/src/host/sessionRpc.ts:209-227`. Gated `libs/ui/src/atoms/sessionLifecycle.atoms.ts:140,155,250`. UI `libs/ui/src/components/sessionHistory/sessionActionAvailability.ts:40,46`. Local state is updated optimistically through `withArchived` (`libs/ui/src/host/harnessStateTransitions.ts:151-165`). The `session_info_update._meta.jetbrains.air.archived` echo is ignored (`libs/ui/src/host/applySessionUpdate.ts:50-55` reads only `title`).        |
| `sessionRename`                          | **Full**                         | `agentCapabilities.ts:94`; `schema/agent.ts:71-72, 413`; `sessionRpc.ts:229-237`; `sessionLifecycle.atoms.ts:502`; `libs/ui/src/components/sessionHistory/SessionTitleInlineRename.tsx:44`. Resulting `session_info_update.title` is applied (`applySessionUpdate.ts:50-53`).                                                                                                                                                                                                                                                                                                                                                              |
| `sessionBatchGet`                        | None                             | No `_session/batch_get` hits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sessionListSubscribe`                   | None                             | No `_session/list/subscribe` / `changes` hits. History refreshes by re-listing (`sessionLifecycle.atoms.ts:192-210`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sessionWorktrees`                       | None                             | No `agentWorktree` / `includeWorktrees` hits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `nativeSubagentSessions`                 | **Partial (behaviourally full)** | Not declared in the AIR list, but hoa sends `clientCapabilities.subagents: {}` (`agentCapabilities.ts:124`). With AIR identity, both adapters use the AIR draft form, which hoa decodes (`libs/effect-acp/src/schema/subagent.ts:16-27`, routing `libs/ui/src/host/subagentRouting.ts:20,61`, fold `libs/ui/src/host/subagent.ts:140`, transcript row `libs/ui/src/host/sessionUpdateReducer.ts:84-85,443-447`, view `.../chatItems/SubagentItemView.tsx:16`). The Claude `subagent_spawned.prompt` field is not in the schema, so it is dropped.                                                                                          |
| `planFile`                               | **Partial (undeclared)**         | hoa reads `rawInput.planFilePath` (`sessionUpdateReducer.ts:64-65, 331-340, 646, 670-698`) and shows a banner (`libs/ui/src/components/sessionChat/composer/latestPlanFilePath.ts:6`, `Composer.tsx:79,207`). This works through Claude's documented fallback (the path is present without the capability). Not declared.                                                                                                                                                                                                                                                                                                                  |
| `customAnswer` (AIR key, no capability)  | Partial                          | Reads only the legacy root `_askUserQuestionCustomAnswer.questionId` (`libs/ui/src/components/sessionChat/pendingInteractions/elicitationFormViews.ts:106-110,168-171`), which Claude still sends. The namespaced `_meta.jetbrains.air.customAnswer` is not read. Codex's legacy key is `true` (no `questionId`); hoa pairs Codex notes through `codex.role === "user_note"` instead (`:173-176`).                                                                                                                                                                                                                                         |
| `kind: "skill"` / `skillPath` (AIR keys) | Full                             | `isSkillCommand` `airMeta.ts:39-50`, used `sessionUpdateReducer.ts:502`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `steering` (sibling)                     | Full                             | `agentCapabilities.ts:96`; `sessionRpc.ts:277-289`; `libs/ui/src/atoms/promptTurn.ts:246-271`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sessionFailure`                         | None                             | No hits. Errors surface as `RequestErrorItem` (`sessionUpdateReducer.ts:89-97`) from JSON-RPC errors (`libs/ui/src/atoms/promptTurn.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `agentFileChangeReport`                  | None                             | No hits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `customInstructions`                     | None                             | No hits. hoa sends no system prompt or `customInstructions` on `session/new`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `asyncTasks`                             | None                             | No `async_task` hits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `recommendedValue`                       | None                             | No hits. The model picker has its own hide/reorder prefs (`libs/ui/src/atoms/userSettings/userSettingsDocument.atoms.ts:70-94`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `diffPatch`                              | None                             | No hits. hoa renders no diffs at all (no `oldText`/`newText` hits; tool rows keep `command`, `locationPath`, `planFilePath`, `resultText` only, `sessionUpdateReducer.ts:58-71`).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `backgroundSubagents`                    | None                             | No hits, so Claude holds the prompt open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rawInputRendering`                      | None                             | Not declared, which is correct for hoa (see ranking).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `planContentDelta`                       | None                             | No hits. hoa does not declare `clientCapabilities.plan` either, so Codex plans arrive as message text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `codexHooks`                             | None                             | No `_codex/hooks` hits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `loadReplayEnd`                          | None                             | No hits. The current branch (#278, commit `cfc8c04` "Replay session/load into an empty transcript and restore it on failure") infers the end of the replay from the `session/load` response.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `goal`                                   | None                             | No `_session/goal` hits. Snapshots arrive (AIR identity) and are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `promptSuggestions` (Claude, AIR-only)   | None                             | No hits. It arrives in `session_info_update._meta` and is ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Ranked recommendations

Value is judged against hoa's existing features: the session history/nav list with archive/rename/pins, session chat transcript, subagent rows and child sessions, Composer (model picker, `$`/`/` menus, plan banner), the Send/turn lifecycle with steering, and Lazy hydrate / `session/load` replay. Cost is a rough estimate for this codebase.

| Rank | Capability                                                                      | Value       | Cost      | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------- | ----------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `sessionIndex`, completed (pagination + row `_meta`) and `sessionListSubscribe` | High        | Low → Med | Already negotiated, so no handshake change is needed. **Pagination is a correctness fix:** today each provider list stops at 50 rows. Fix it by sending `list.limit` (200 for Claude, 100 for Codex) and following `nextCursor`. Reading row `state` (`running`/`requires_action`/`error`), `lastPromptAt`, `model`, `cost` and `forkedFrom` lights up the History nav (activity badges, order by last prompt, fork lineage) for free. Subscribing per cwd replaces the full re-list on refresh, and shows sessions that other processes (the CLI, AIR) create or rename. The subscribe step is a JSON-RPC notification handler plus lifecycle, so medium cost.                                                                                                                                                                                                                               |
| 2    | `sessionFailure`                                                                | High        | Medium    | Maps onto the existing `RequestErrorItem` transcript row (`sessionUpdateReducer.ts:89-97`), but adds stable ids with in-place revisions (retry progress "attempt n of m"), severity, and recovery actions. `retry` maps to re-Send, `new_session` to the new-session flow. Also replaces Codex's `Warning:` text chunks with structured notices. Cost: a schema, a new chat item kind (or an extension of `request_error`), and reading both `PromptResponse._meta` and `session_info_update`.                                                                                                                                                                                                                                                                                                                                                                                                |
| 3    | `loadReplayEnd` (Claude)                                                        | Medium-High | Low       | The marker comes **before** the `session/load` response, so on success it only lets hoa mark the history complete and readable earlier. That still matters: Claude replays while the CLI starts, and the CLI start takes most of the load time (`v1/acp-agent.js` `createSessionWhileReplaying`). Its distinct value is on failure. #278 (`cfc8c04`) starts a `load` from an empty transcript and, on failure, restores the pre-activation transcript (`harnessStateTransitions.ts` `failActivation(..., previousTranscript)`). With the marker, a load that fails _after_ a complete replay (for example a CLI start failure) could keep the fresh, complete replayed history instead of reverting to a possibly stale or empty one. Cost: add the name to the declared list, plus one `session_info_update` `_meta` check. Codex does not support it, so keep the response as the fallback. |
| 4    | `sessionBatchGet`                                                               | Medium      | Low       | Pinned sessions outside the listed page can be refreshed by id instead of being treated as "missing". Today `pinsToUnpinAfterList` skips its sweep whenever a page is partial (`pinnedSessions.ts:18-21`). One request and a merge by `sessionId`. Most useful after rank 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5    | `backgroundSubagents` (Claude)                                                  | Medium-High | Medium    | Without it, a Claude turn that spawns a background Agent keeps Send in its in-turn state (steer vs prompt) until the subagent ends. `applySessionUpdate` is turn-agnostic (`applySessionUpdate.ts:20-35`), so out-of-turn updates already land. Not verified: whether permission requests, elicitations and ExitPlanMode prompts that arrive with no turn in flight, and the "working" indicator, behave correctly. That is the main cost and risk.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6    | `recommendedValue`                                                              | Medium      | Low       | Removes Claude's ambiguous `default` model and effort rows, and makes the shown effort the effort actually applied. Fits the Composer model picker and hidden-model prefs. Codex adds only a "recommended" badge. Declare it and read one `_meta` string per select option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7    | `agentFileChangeReport`                                                         | Medium      | Low → Med | A per-turn "files changed" list for a turn summary or a "review changes" affordance in chat or the Hub. Cheap on the wire: one `requestId` per prompt and one `session_info_update`. Both adapters say the list is incomplete (`declaredComplete: false`; Bash edits are missed), so present it as best effort.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8    | `asyncTasks`                                                                    | Medium      | Medium    | A background Bash or command panel with Stop (`_session/async_task/stop`). This fits next to the subagents view. Claude also publishes autonomous turns as tasks, which helps show "Claude is working" after a turn ended. New update kinds, a store and a stop action are needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 9    | `goal` (`_session/goal`)                                                        | Medium-Low  | Medium    | Snapshots already arrive. A goal chip in the Composer with set/clear (plus pause/resume on Codex) is a distinct feature. It also brings autonomous cycles outside prompts, which overlaps with ranks 5 and 8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 10   | `customInstructions`                                                            | Low-Med     | Low       | A one-field way to append hoa-specific instructions (for example Hub or handoff etiquette) on `session/new` for both providers, with no declaration needed. Compare with the earlier system-prompt research ([`2026-09-10-acp-system-prompt-injection.md`](./2026-09-10-acp-system-prompt-injection.md)). The value depends on product need.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11   | `diffPatch`                                                                     | Low (now)   | Medium    | hoa renders no diffs, so this has no value until a diff view exists. If one is built, prefer the patch: it is compact, exact, and avoids 12k-line `oldText`. Note that hoa must then render "unavailable" rather than the empty placeholders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12   | `planFile` (declare)                                                            | Low         | Low       | hoa already gets `planFilePath` through the fallback. Declaring it **removes the inline plan text**, which is a regression unless hoa reads the file. Only declare once the plan banner opens and reads the file. Gains a stable `plan-mode:<toolCallId>` id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 13   | `planContentDelta` (Codex)                                                      | Low         | Medium    | Needs draft `clientCapabilities.plan` and a Markdown plan view first. Today Codex plans arrive as message text, which hoa already renders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14   | `codexHooks`                                                                    | Low         | Medium    | Only matters if hoa passes `CODEX_CONFIG.hooks`. Trust is global to `$CODEX_HOME`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 15   | `rawInputRendering`                                                             | Negative    | —         | It would strip the human-readable copies (plan, subagent prompt, questions) from `content`, and hoa would have to render `rawInput` per tool. Do not declare it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Cheap AIR-identity wins outside the capability list:

- `promptSuggestions` (Claude) as Composer ghost text, filled with Tab. Low cost.
- Reading `_meta.jetbrains.air.archived` from `session_info_update` to confirm the optimistic archive.
- Reading namespaced `customAnswer` before the legacy key is removed upstream (the Claude doc marks the legacy key for removal).

## Open questions

- **Is the 50-row `session/list` cap intentional?** The desktop nav has its own per-group "Show more" cap (`apps/desktop/GLOSSARY.md` §Session history), which is a different, client-side limit. Confirm with a session-rich `~/.claude/projects` before treating this as a bug.
- **Out-of-turn interactions with `backgroundSubagents`.** Not verified against hoa's pending-interaction and turn state machine (`libs/ui/src/atoms/promptTurn.ts`, `harnessStateTransitions.ts`).
- **Subagent form choice.** hoa receives the AIR **draft** subagent form only because it declares AIR identity. If hoa ever drops AIR identity, Claude switches to the revised RFD form (`subagent_update`, `session_message`), and Codex (v1, non-AIR, with `subagents`) switches to `"standard"`. hoa's schema already accepts `subagent_update` (`schema/subagent.ts:23`), but `session_message` routing was not checked here.
- **Stale `customInstructions` in Claude's doc.** It is advertised in code but missing from the doc's capability table. Treat the semantics as code-only: append to the preset; no client gate.
- **Stale fixtures.** `apps/desktop/fixtures/{claude,codex}_initialize_response.json` show older AIR lists (`["sessionFailure","agentFileChangeReport"(, "nativeSubagentSessions")]`) than the observed 0.103.0 / 2.6.0 responses.
- **Both adapters are marked "Status: Experimental"** in their AIR docs, and both shape each extension to become a first-class ACP API later. Pin adapter versions when building on them, and prefer the ACP-standard fields once they land: the session list RFD, #2161 archive, `session.notices`, `session.compaction`, and the subagent RFD.

## Sources

- Claude adapter code (installed): `~/.hoa/providers/claude-agent-acp/runtime/0.103.0/node_modules/@agentclientprotocol/claude-agent-acp/dist/`
  - `air-extension.js:1-160` (capability constants, `isAirClient`, `clientSupportsAirCapability`, `airCustomInstructions`)
  - `v1/acp-agent.js:525, 677-688, 794-850, 6369-6382, 7494-7495`
  - `acp-subagents.js:1-15`, `native-subagents.js:985-1010, 1395-1440`
  - `file-change-audit.js:1-31`, `client-system-prompt.js:29-63`, `session-failure-extension.js:5,86,155`, `async-tasks.js:19`, `tool-calls/background.js:33`, `tool-calls/client-capabilities.js:42-45`, `diff.js:585`, `session-model.js:238`, `session-effort.js:115`
  - `v1/session-index/connection.js:41-67`, `v1/session-index/session-index.js:30-31`, `v2/air.d.ts`
- Claude adapter contract: https://github.com/agentclientprotocol/claude-agent-acp/blob/v0.103.0/docs/air-extensions.md
- Codex adapter code (installed): `~/.hoa/providers/codex-acp/runtime/2.6.0/node_modules/@agentclientprotocol/codex-acp/dist/index.js`
  - L32531-32610 (`src/AirExtension.ts`), L35871-35874 (goal), L35958-35967 (client choices), L36290-36307 (recommendedValue), L37855-37857 (file-change request), L42437 / L43217-43221 (customInstructions)
  - L47458 (async stop), L47926-47932 (subagent protocol), L47953-47954 (hooks), L48230-48252 (session-index keys), L50074-50082, L50536-50538, L50741-50744, L51155-51200 (initialize `_meta`)
- Codex adapter contract: https://github.com/agentclientprotocol/codex-acp/blob/v2.6.0/docs/air-extensions.md
- ACP RFDs referenced by the adapters: subagents [#1992](https://github.com/agentclientprotocol/agent-client-protocol/pull/1992), archive [#2161](https://github.com/agentclientprotocol/agent-client-protocol/pull/2161), set title [#1987](https://github.com/agentclientprotocol/agent-client-protocol/pull/1987), session list extensions [#2323](https://github.com/agentclientprotocol/agent-client-protocol/pull/2323)
- Observed `initialize` responses: supplied by the user through the coordinator (codex-acp 2.6.0, claude-agent-acp 0.103.0)
- hoa code: paths and lines cited inline above (all under `libs/ui/src`, `libs/effect-acp/src`, `apps/desktop`)

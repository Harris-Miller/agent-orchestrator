# ACP v1 and v2 side by side, chosen per provider: wire diff, hoa surface, design, effort

Date: 2026-11-24
Question: What would it take for hoa to speak ACP v1 and ACP v2 at the same time, with the version chosen per provider? The example target is Claude (`@agentclientprotocol/claude-agent-acp`) and Codex (`@agentclientprotocol/codex-acp`) on v2, and Antigravity (`antigravity-acp` / `agy_acp_server`) on v1.

Related: [`2026-11-18-acp-jetbrains-air-capabilities.md`](./2026-11-18-acp-jetbrains-air-capabilities.md) covers the AIR extensions and how their lists differ between v1 and v2. [`2026-11-23-generic-acp-agent-support.md`](./2026-11-23-generic-acp-agent-support.md) covers provider modelling (`AgentLaunchTarget`, `PROVIDER_QUIRKS`).

## Summary

- **v2 is a different protocol, not a version bump.**
  - It moved to Preview on 2026-11-20 and is "not frozen" ([announcement](https://agentclientprotocol.com/announcements/acp-v2-preview)).
  - It removes `session/load`, `session/set_mode`, all `fs/*` and all `terminal/*` client methods.
  - It renames `authenticate` / `logout` to `auth/login` / `auth/logout`.
  - It restructures `initialize`: `info` / `capabilities` replace `clientInfo` / `clientCapabilities` / `agentInfo` / `agentCapabilities`.
  - **`session/prompt` no longer ends the turn.** It returns `{ messageId }`. The turn ends with a `state_update` of `idle` that carries `stopReason`.
  - There is no `tool_call` update. The first `tool_call_update` for an id creates the call.
  - Permission requests lose `toolCall` and gain `title` / `subject`.
  - Diffs become `changes` plus an optional `patch`.
  - Sources: `@agentclientprotocol/sdk@2.12.0` `dist/{v1,v2}/stable/methods.d.ts`, `schema/{v1,v2}/schema.json`, and the [v2 migration guide](https://agentclientprotocol.com/protocol/v2/migration.md).
- **Antigravity cannot be trusted to negotiate.**
  - Probed live, `agy_acp_server` 1.5.2 (the current registry build, sha256 matches) **echoes any requested `protocolVersion`**. Asked for 2 it answers `2`, and asked for 7 it answers `7`. In both cases the body is v1-shaped: `agentCapabilities`, `agentInfo`, `authMethods[].id`.
  - That breaks the v2 rule "MUST select the highest protocol version it supports that is less than or equal to the requested version" ([v2 initialization](https://agentclientprotocol.com/protocol/v2/initialization.md)).
  - So a **per-provider pin is required**. Antigravity must be asked for v1 only, and fallback detection must check the response **shape**, not only the number.
- **Claude on v2 drops features hoa ships today.**
  - The Claude v2 core (claude-agent-acp 0.112.0) serves none of `_session/archive`, `_session/unarchive`, `_session/rename`, `_session/steering`, `_session/goal`, `_session/async_task/stop` or the AIR `sessionIndex` (`v2/agent.js:73-96`).
  - On v2 it advertises only the AIR capabilities `agentFileChangeReport` and `recommendedValue` (`v2/air.js:28`). From code, it has no `sessionFailure` and no archived filter. The live probe (sent without AIR identity) confirms only that `_meta.steering` is absent.
  - Codex v2 keeps steering, archive, rename, batch_get, list-subscribe and `sessionFailure` (`codex-acp/dist/index.js:59019`, `:53392-53398`).
  - So "Claude on v2" is a product trade-off, not only an engineering task. See [Feature parity](#feature-parity-per-provider-and-version).
- **The ACP TypeScript SDK question is mostly moot.**
  - hoa does not import `@agentclientprotocol/sdk` anywhere. It appears only in `libs/effect-acp/package.json:15` (pinned `^1.9.0`, `pnpm-workspace.yaml:29`).
  - The wire layer is hoa's own Effect RPC schema (`libs/effect-acp`).
  - The SDK already ships v2 as `@agentclientprotocol/sdk/experimental/v2` in 1.9.0, and 2.12.0 is the latest. It serves only as the reference schema.
  - Running v1 and v2 side by side is trivial for hoa: each launch target is its own child process and connection.
- **Effort:** about 20-34 engineer-days (4-7 weeks) for a dual-version MVP with Codex on v2, and 23-39 days (5-8 weeks) with Claude parity gating. These are the sums of the [§5](#5-effort-estimate) table.
  - The largest piece is moving the Prompt turn from "response ends the turn" to "`state_update` ends the turn" (consumers: `promptTurn.ts`, `sessionRpc.ts`, `notifyAttention.ts`, `handoff.atoms.ts` and `spawnedSubagent/lifecycle.ts`).
  - Top risks:
    1. Preview churn: three SDK releases on 2026-11-24 alone, and the two adapters pin different SDK Previews.
    2. Antigravity's bogus negotiation.
    3. Claude v2 losing archive, steering and sessionFailure.
    4. The subagent wire form changing.
    5. hoa has no v2 fixtures.
- **Recommendation:**
  - Build one internal, event-driven session model and put a per-version wire adapter at the edge (Option A below).
  - Ship Codex on v2 first; it has near-full parity.
  - Keep Claude on v1 until its v2 core regains archive, sessionFailure and the session index, or until hoa accepts the loss.
  - Keep Antigravity and Cursor on v1.

## Method

- **Spec.**
  - Fetched on 2026-11-24: the [llms.txt index](https://agentclientprotocol.com/llms.txt), the [v2 Preview announcement](https://agentclientprotocol.com/announcements/acp-v2-preview), the [v2 migration guide](https://agentclientprotocol.com/protocol/v2/migration.md) and [v2 initialization](https://agentclientprotocol.com/protocol/v2/initialization.md).
  - The migration guide is long. Its first part was read verbatim and the rest as a summary. Every structural claim below is cross-checked against the SDK JSON schema. Claims that rest only on that summary are marked _(guide summary)_.
- **SDK.**
  - `npm pack @agentclientprotocol/sdk@2.12.0` (published 2026-11-24). Diffed `schema/v1/schema.json` against `schema/v2/schema.json`: 203 vs 214 `$defs`, compared by name and by shape (properties and variants).
  - Read `dist/{v1,v2}/stable/methods.d.ts`, `dist/protocol-router.d.ts` and `MIGRATION_STABLE_UNSTABLE.md`.
  - Compared the installed `libs/effect-acp/node_modules/@agentclientprotocol/sdk` (1.9.0) `package.json` exports.
  - **Note:** the v1-vs-v2 diff is between the two schemas of SDK 2.12.0, not against hoa's pinned 1.9.0.
- **Adapters (installed runtimes).**
  - Claude: `~/.hoa/providers/claude-agent-acp/runtime/0.112.0/node_modules/@agentclientprotocol/claude-agent-acp/dist/`, including `serve.js`, `index.js`, `v2/{agent,initialize,air,session}.js` and `v1/`. Its `package.json` pins `@agentclientprotocol/sdk` 2.12.0.
  - Codex: `~/.hoa/providers/codex-acp/runtime/2.12.0/node_modules/@agentclientprotocol/codex-acp/dist/index.js`, a single bundle. Its `package.json` pins `@agentclientprotocol/sdk` `~2.9.1`.
  - Codex changelog: `gh api repos/agentclientprotocol/codex-acp/contents/CHANGELOG.md`.
- **Antigravity.**
  - There is no runtime under `~/.hoa/providers/antigravity-acp` on this machine (only `session-index.json`).
  - Fetched the registry entry (`agentclientprotocol/registry` `antigravity-acp/agent.json`, version 1.5.2). Downloaded `agy-acp-server-1.5.2-darwin-arm64.zip`; its sha256 `123a16d5…4845` matches the registry.
  - String-scanned the binary, then probed it over stdio with `initialize` at `protocolVersion` 1, 2 and 7.
- **Live probes of `initialize` with `protocolVersion: 2`** (v2 params: `info`, `capabilities`, no AIR):
  - Claude 0.112.0 answered with a v2 body.
  - The Codex 2.12.0 probe **failed** in that runtime: a missing `@openai/codex-darwin-arm64` optional dependency, from `@openai/codex/bin/codex.js:108`. Codex v2 behaviour below is therefore **from code only (unverified live)**.
- **hoa.** Ran `rg` over `libs/effect-acp/src`, `libs/ui/src` and `apps/desktop/src` for every v1-specific method, update kind and field. Read `AcpConnection.ts`, `AcpSchema.ts`, `schema/{agent,client,common}.ts`, `backendHarness.ts`, `agentCapabilities.ts`, `clientHandlers.ts`, `sessionRpc.ts` and `sessionUpdateReducer.ts` (switch), plus `promptTurn.ts` and `sessionLifecycle.ts` (activation).

## 1. Wire-level v1 → v2 differences that matter to hoa

### Methods

From `@agentclientprotocol/sdk@2.12.0` `dist/v1/stable/methods.d.ts` vs `dist/v2/stable/methods.d.ts`, plus the [migration guide](https://agentclientprotocol.com/protocol/v2/migration.md) method table:

| v1                                                              | v2                                                                              | hoa today                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `initialize` (`clientCapabilities`, `clientInfo`)               | `initialize` (`capabilities`, required `info`)                                  | `backendHarness.ts:121-124`, schema `effect-acp/src/schema/agent.ts:82-99`          |
| `authenticate { methodId }`                                     | `auth/login { methodId }`                                                       | Antigravity only, `backendHarness.ts:144`                                           |
| `logout`                                                        | `auth/logout`                                                                   | schema only                                                                         |
| `session/load`                                                  | **removed**; `session/resume` with `replayFrom: { type: "start" }`              | `sessionRpc.ts:258-271`, chosen at `sessionLifecycle.ts:231-232`                    |
| `session/resume`                                                | gains `replayFrom`; baseline (no capability)                                    | `sessionRpc.ts:274-287`                                                             |
| `session/list`, `session/close`                                 | baseline (no capability)                                                        | `sessionRpc.ts:182-188, 290-298`                                                    |
| `session/set_mode`                                              | **removed**; use `session/set_config_option`                                    | schema only (`AcpSchema.ts:131`); hoa already uses config options                   |
| `session/prompt` → `{ stopReason }`                             | `session/prompt { idempotencyKey? }` → `{ messageId }` (acceptance, not end)    | `sessionRpc.ts:379-398`, `promptTurn.ts:139-179`                                    |
| `session/cancel`                                                | same; completion arrives as idle `state_update`; un-inserted prompts → -32800   | `sessionRpc.ts:421-433`                                                             |
| `session/request_permission { toolCall, options }`              | `{ title, description?, subject?, options }`                                    | schema `client.ts:39-46`; UI `PendingPermissionCard.tsx:10-16`                      |
| `fs/read_text_file`, `fs/write_text_file`                       | **removed**                                                                     | stubs, not advertised (`clientHandlers.ts:129-130`, `agentCapabilities.ts:151-158`) |
| `terminal/create`, `output`, `release`, `wait_for_exit`, `kill` | **removed**; agent-owned terminals arrive as `terminal_update`                  | stubs, not advertised (`clientHandlers.ts:173-177`)                                 |
| —                                                               | new `tool_call/cancel`, `terminal/cancel` (gated by item `capabilities.cancel`) | none                                                                                |
| `elicitation/create`                                            | exactly one of `sessionId` / `requestId`; string `pattern` removed              | `ClientRpcs` `AcpSchema.ts:140-150`                                                 |
| `$/cancel_request`                                              | cannot cancel an inserted `session/prompt`                                      | `schema/protocol.ts`                                                                |

Other v2 changes:

- **Unstable v2 methods.** The adapters also serve unstable v2 methods: `session/fork`, `session/set_title`, `session/status`, `session/options`, `auth/status` and `providers/*`. See Claude `v2/agent.js:74-96` and Codex `index.js:59019`.
- **No batching.** JSON-RPC batches are rejected with `-32600`, and `id: null` is not allowed ([announcement](https://agentclientprotocol.com/announcements/acp-v2-preview)). hoa never batches.

### Session update kinds

From the `SessionUpdate` variants in `schema/v1/schema.json` vs `schema/v2/schema.json` (SDK 2.12.0):

- **Removed:**
  - `tool_call`. The first `tool_call_update` for a `toolCallId` creates the call (an "upsert").
  - `plan`. Use `plan_update` / `plan_removed`.
  - `current_mode_update`. Use `config_option_update`.
- **New:**
  - `user_message`, `agent_message`, `agent_thought`: whole-message upserts keyed by `messageId`.
  - `state_update`: `running` / `idle` / `requires_action` / `unknown`, with `stopReason` (including the new `error`) and a `background` list of `terminal` / `tool_call` / `subagent` entries (`StateUpdate`, `BackgroundWork` defs).
  - `tool_call_content_chunk`, `terminal_update` and `terminal_output_chunk`.
  - `replay_complete`: "Every update for the session between the `session/resume` request and this update is replayed history" (`ReplayComplete` def).
- **Kept, changed:**
  - `*_message_chunk` require `messageId`.
  - `tool_call_update` gains `paused` / `cancelled` statuses and `capabilities`. A field that is omitted means unchanged, and `null` means cleared _(guide summary; the upsert semantics are confirmed by the schema's `x-state: upsert`)_.
  - `config_option_update`: `id` → `configId`, `group` → `groupId` (`SessionConfigOption` def).
  - `available_commands_update`: commands carry `type`.
  - `session_info_update` / `usage_update`: `_meta` is a patch.
- **No client capability needed:** `notice`, `compaction_update`, `compaction_summary_chunk`, `subagent_update`, `session_message` and `session_message_chunk` are unconditional on v2.
- **Subagents.** v2 has only the RFD form (`subagent_update` + `session_message`), not the AIR draft form (`subagent_spawned` / `subagent_state_update`) that hoa decodes today (`effect-acp/src/schema/subagent.ts:23`).

### Types

- **Diff.** `{ path, oldText, newText }` becomes `{ changes: DiffChange[], patch?: { format, text } }` (`Diff`, `DiffPatch` defs). "There is no mechanical mapping from v1 diffs" ([migration guide](https://agentclientprotocol.com/protocol/v2/migration.md)). hoa renders no diffs (11-18 note), so this costs nothing now.
- **`ToolCallContent` `terminal`.** Now only a reference (`terminalId`). Output lives in `terminal_update.output` and `terminal_output_chunk` _(guide summary)_. hoa takes tool `resultText` from `content` (`sessionUpdateReducer.ts:766, 786`), so on v2, **Bash output may not reach the row**. Unverified against a live Codex or Claude v2 stream.
- **Capabilities.**
  - `agentCapabilities.{loadSession, promptCapabilities, mcpCapabilities, sessionCapabilities}` becomes `capabilities.session.{prompt, mcp, delete, additionalDirectories, systemPrompt, …}`.
  - `list`, `resume` and `close` become baseline.
  - `clientCapabilities.{fs, terminal, session, subagents, plan}` are gone. Only `auth`, `elicitation` and `_meta` remain (`ClientCapabilities`, `AgentCapabilities`, `SessionCapabilities` defs).
- **MCP servers.** Each needs `type`, a stdio `command` must be absolute, and `sse` is removed (`McpCapabilities` def; _guide summary_ for the absolute-path rule).
- **Auth methods.** `id` becomes `methodId`, `type` is required, and `env` becomes an array of `{ name, value }` (Claude `v2/initialize.js:31-43`).
- **Errors.** New `-32022` with `UnsupportedProtocolVersionErrorData { requested, supported }`, and `-32002` session not found with `SessionNotFoundErrorData` (`ErrorData` def).

## 2. SDK support

- **v2 ships in the SDK.**
  - The installed 1.9.0 exports `./experimental/v2` and `./schema/v2/schema.unstable.json` (`libs/effect-acp/node_modules/@agentclientprotocol/sdk/package.json` exports).
  - 2.x reorganised the package into `.` (stable v1), `/unstable` (full v1), `/experimental/v2` (stable v2) and `/experimental/v2/unstable` (full v2). It also removed the legacy v1 connection classes in favour of an "app API" (`MIGRATION_STABLE_UNSTABLE.md`).
- **Release cadence is a churn signal.**
  - npm has 1.9.0 (2026-10-16), 2.0.0 (2026-10-19) and then 15 more releases up to **2.12.0**.
  - **2.10.0, 2.11.0 and 2.12.0 were all published on 2026-11-24** (`pnpm view @agentclientprotocol/sdk time`).
- **Running both versions in one process.**
  - On the agent side, the SDK offers `agentProtocolRouter().withV1(…).withV2(…)`. "Endpoints exposing v2 select the highest configured version at or below the requested version". A repeated `initialize` asking for a lower version "gets `-32022` with `supported: [2]` … To use v1 after that, the client opens a new connection" (`dist/protocol-router.d.ts:4-30`).
  - The SDK has **no client-side router**: only `client()` per version (`dist/v1/bindings.d.ts:676`, `dist/v2/bindings.d.ts:1204`). A client picks the version itself.
  - A process can hold v1 and v2 connections side by side, because each `client()` app is per connection.
- **For hoa the SDK version does not matter.**
  - No hoa source imports it (an `rg` for `agentclientprotocol/sdk` in `apps/`, `libs/` and `tooling/` hits only `package.json`).
  - hoa's connection is its own Effect `RpcClient` / `RpcServer` over NDJSON (`AcpConnection.ts:297-420`), with hand-written schemas (`AcpSchema.ts`).
  - Bumping the catalog to 2.12.0 would only update the reference JSON schema. It would be useful for a schema conformance test, not required.

## 3. hoa's ACP surface and what each piece needs

| Area                                 | Where                                                                                                                                                                               | v2 impact                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connection + RPC groups              | `libs/effect-acp/src/AcpConnection.ts:297-420`, `AcpSchema.ts:121-174`                                                                                                              | **Branch.** The same tags (`initialize`, `session/new`, `session/prompt`, `session/request_permission`) carry different payloads and results, so v2 needs its own `RpcGroup`s and its own `connectAcpAgent` variant (or one parameterised by group). The demux and transport (`AcpConnection.ts:65-241`, `AcpTransport.ts`) are version-neutral. |
| Schemas                              | `schema/agent.ts:82-99` (initialize), `client.ts:39-46` (permission, `toolCall` required), `common.ts:87` (`ProtocolVersion`)                                                       | **Branch.** v1 `InitializeResponse` and `RequestPermissionRequest` would fail to decode v2 frames. `SessionUpdate` is `Schema.Unknown` (`common.ts:184`), so updates decode on both versions.                                                                                                                                                    |
| `initialize` call + protocol version | `backendHarness.ts:121-124` (hard-coded `protocolVersion: 1`); `acpSessionBootstrap.ts:569-570` (records the answer)                                                                | **Branch** plus fallback. Per-provider pin; see [§4](#4-design-options).                                                                                                                                                                                                                                                                         |
| Client capability offer              | `agentCapabilities.ts:151-158` (`clientCapabilitiesFor`); AIR offer `PROVIDER_QUIRKS` `:68-87`                                                                                      | **Branch.** v2 sends `capabilities: { elicitation, _meta: { jetbrains: { air } } }` plus `info`. `subagents`, `session.configOptions` and `plan` no longer exist as client capabilities.                                                                                                                                                         |
| Agent capability read                | `agentCapabilities.ts:106-126` (`agentCapabilitiesFrom`); `supportsMcpHttp` `:129`                                                                                                  | **Adapter.** Read `capabilities.session.*`, and treat list, resume and close as always on.                                                                                                                                                                                                                                                       |
| Agent info and auth methods          | `acpSessionBootstrap.ts:495, 540-566`                                                                                                                                               | **Adapter.** `info` vs `agentInfo`; `methodId` (already accepted at `:495`).                                                                                                                                                                                                                                                                     |
| Authenticate                         | `backendHarness.ts:144`                                                                                                                                                             | Rename to `auth/login` on v2. Antigravity stays on v1, so this is moot for now.                                                                                                                                                                                                                                                                  |
| Session setup                        | `sessionRpc.ts:191-299`                                                                                                                                                             | **Adapter.** `session/load` becomes `session/resume` + `replayFrom`. `NewSessionResponse` loses `modes` and gains `availableCommands`. MCP server entries need `type`.                                                                                                                                                                           |
| Activation / replay                  | `sessionLifecycle.ts:220-240`; `airMeta.ts:107-109` (`loadReplayEnd`); `harnessStateTransitions.ts:496`                                                                             | **Adapter.** Map `replay_complete` onto the existing AIR `loadReplayEnd` path, which has the same meaning.                                                                                                                                                                                                                                       |
| Session update reducer               | `sessionUpdateReducer.ts:703-850` (switch: `tool_call` `:752`, `tool_call_update` `:779`, `plan` `:742`, chunks `:708-833`, `session_message` `:847-850`)                           | **Normaliser in front.** See [§4](#a-normalising-edge-recommended).                                                                                                                                                                                                                                                                              |
| Config options                       | `sessionRpc.ts:436-471` (already `configId`); 18 chip files under `components/sessionChat/configChips/`                                                                             | **Normaliser.** Rename `id` → `configId` and `group` → `groupId` on the way in, so the UI stays untouched.                                                                                                                                                                                                                                       |
| Prompt turn lifecycle                | `promptTurn.ts:96, 139-179, 246-301`; `sessionRpc.ts:364-398` (`closeOrphanedToolCalls`); `notifyAttention.ts:21-36`; `handoff.atoms.ts:60`; `spawnedSubagent/lifecycle.ts:102-213` | **Largest change.** The turn end moves from the `session/prompt` response to the idle `state_update`. See [§4](#prompt-turn-the-l-item).                                                                                                                                                                                                         |
| Steering                             | `sessionRpc.ts:405-419` (`_session/steering`); fallback `promptTurn.ts:246-301`                                                                                                     | Codex v2 keeps `_session/steering`. Claude v2 steers through a plain `session/prompt` while busy (`v2/session.js:5`; spec: agents "MUST NOT reject a prompt only because work is active").                                                                                                                                                       |
| Permission UI                        | `PendingPermissionCard.tsx:10-16`                                                                                                                                                   | **Adapter.** Use v2 `title` and `subject.toolCallId`.                                                                                                                                                                                                                                                                                            |
| Archive / unarchive / rename         | `sessionRpc.ts:301-328`; capability `agentCapabilities.ts:118, 122`                                                                                                                 | Codex v2: unchanged. Claude v2: no archive; rename via `session/set_title`.                                                                                                                                                                                                                                                                      |
| Subagents                            | `effect-acp/src/schema/subagent.ts:16-27`; `subagentRouting.ts`; `subagent.ts:166`                                                                                                  | v2 has only the RFD form. `subagent_update` is already accepted (`subagent.ts:23`). `session_message` routing was never checked (11-18 note, Open questions).                                                                                                                                                                                    |
| fs / terminal client methods         | `clientHandlers.ts:129-130, 173-177`                                                                                                                                                | None. They are stubs and not advertised; leave them out of the v2 group.                                                                                                                                                                                                                                                                         |
| Telemetry                            | `acpTelemetry.ts` (update kinds incl. `current_mode_update`, `'plan'`); `promptTurnTelemetry.ts`                                                                                    | Add the v2 kinds. Add an allowlisted `acp.protocol_version` attribute (root ADR 0002).                                                                                                                                                                                                                                                           |
| Fixtures                             | `apps/desktop/fixtures/*_initialize_response.json` (`protocolVersion: 1`), `docs/research/sample_acp_meessages/`, `libs/ui/fixtures/`                                               | All v1. v2 fixtures must be recorded.                                                                                                                                                                                                                                                                                                            |

## Feature parity per provider and version

The features hoa ships today, from the 11-18 note §What hoa implements, checked against the adapter handler lists:

| hoa feature                          | Claude v1                   | Claude v2 (0.112.0)                                               | Codex v1            | Codex v2 (2.12.0)                                         |
| ------------------------------------ | --------------------------- | ----------------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| Load history on activate             | `session/load`              | `session/resume` + `replayFrom` (`v2/agent.js:82`)                | `session/load`      | `session/resume` + `replayFrom` (`index.js:59019`)        |
| Replay-end marker                    | AIR `loadReplayEnd`         | `replay_complete` (spec)                                          | none                | `replay_complete` (spec; changelog 2.6.0 "ACP v2 replay") |
| Archive / unarchive                  | AIR                         | **no**                                                            | AIR                 | AIR (`index.js:59019`)                                    |
| Archived filter (AIR `sessionIndex`) | yes                         | **no** (offset cursors, 1000 per page, `v2/agent.js:62, 517-522`) | yes                 | yes (`index.js:53397`)                                    |
| Rename                               | `_session/rename`           | `session/set_title` (`v2/agent.js:89`)                            | `_session/rename`   | both (`index.js:59019`)                                   |
| Steering                             | `_session/steering`         | `session/prompt` while busy (`v2/session.js:5`)                   | `_session/steering` | `_session/steering` (`index.js:59019`)                    |
| `sessionFailure`                     | AIR                         | **no** (`v2/air.js:28`); use `stopReason: "error"` / `notice`     | AIR                 | AIR (`index.js:53392-53398`)                              |
| `recommendedValue`                   | AIR                         | AIR (`v2/air.js:28`)                                              | AIR                 | AIR                                                       |
| Background subagents / async tasks   | AIR (`backgroundSubagents`) | native `state_update.background`                                  | AIR `asyncTasks`    | native `state_update.background` (changelog 2.8.0)        |
| Fork / close / delete                | yes                         | yes (`v2/agent.js:83-88`)                                         | yes                 | yes                                                       |
| Subagent wire form                   | AIR draft                   | RFD (`subagent_update`, `session_message`)                        | AIR draft           | RFD                                                       |

- Claude also drops `_session/goal` and `_session/async_task/stop` on v2. The v1 core has them, but the complete v2 handler list (`v2/agent.js:73-96`; lines 94-95 are comments) registers no `_session/*` method, and no file in `v2/` mentions `goal`, `async_task` or `archive`. `rewind` appears only as internal resume logic (`v2/agent.js:34, 409, 935-937`), not as a handler.
- The live v2 probe of Claude returned `_meta: { authStatus: {} }` with no `steering` key. That probe sent no AIR identity, so the AIR list was not observed live.
- Codex's v2 AIR list drops `diffPatch`, `rawInputRendering`, `planContentDelta`, `codexHooks`, `nativeSubagentSessions` and `asyncTasks`. The reason given is that "v2 has its own terminal, diff and plan updates" (`index.js:53372-53398`).

## 4. Design options

### A. Normalising edge (recommended)

1. **Per-provider protocol setting.** Add `acpProtocol: 'v1' | 'v2'` to `ProviderQuirks` (`agentCapabilities.ts:52-87`).
   - Start values: Codex `v2` (behind a flag), and Claude, Antigravity and Cursor `v1`.
   - Gate the v2 setting on a **minimum adapter version** (for example Codex ≥ 2.11.0, which closed the v2 gaps per the changelog) and fall back to v1 below it.
   - A Settings > Providers override can come later.
2. **Version-specific wire packages** in `libs/effect-acp`: `AgentRpcsV2` / `ClientRpcsV2` and their schemas, and a `connectAcpAgent` that takes the group pair.
   - Encode the choice as a discriminated union or overloads, per the repo coding rule on mutually exclusive options.
   - The demux, transport and wire log are shared.
3. **One internal session model**, with v1 and v2 both adapted into it. Make that model **event-driven and v2-shaped**:
   - upserts by id;
   - a turn state of `running` / `idle(stopReason)` / `requires_action`;
   - background work;
   - replay begin and end.
   - v1 is adapted _up_:
     - `tool_call` becomes a create-upsert;
     - the `session/prompt` response `{ stopReason }` becomes a synthetic `idle(stopReason)`;
     - AIR `loadReplayEnd` becomes `replay_complete`;
     - AIR `asyncTasks` / `backgroundSubagents` become background entries, later.
   - Adapting v2 _down_ to v1 cannot express agent-initiated turns or background work, so that direction would need rework later.
4. **Normaliser before `sessionUpdateReducer`**, as a pure function `(version, rawUpdate) => InternalUpdate[]`, unit-tested per version:
   - The first `tool_call_update` for an unknown id creates the row. In updates, `null` clears a field and an omitted field leaves it unchanged.
   - `user_message` / `agent_message` / `agent_thought` replace by `messageId`. This matters for replay, because Claude and Codex may send whole messages instead of chunks.
   - `plan_update` / `plan_removed` replace `plan`.
   - `config_option_update` `id`/`group` become `configId`/`groupId`.
   - `terminal_update` / `terminal_output_chunk` fold into the owning tool row's `resultText`, so Bash output keeps showing.
   - `state_update` goes to the turn model, not the transcript.
   - `replay_complete` goes to the activation path.
   - The subagent RFD form goes to `subagentRouting`.
5. **Request and response adapters** for the handful of RPCs whose shapes differ: `initialize`, `session/new` / `resume` / `load`, `session/prompt`, `request_permission`, auth and elicitation.

Pros: the UI, atoms and the 1,000-line `harnessStateTransitions.ts` stay version-agnostic. The v1 path keeps working throughout.

Cons: the internal turn model must change for v1 too, so there is regression risk on today's providers.

### B. Separate v1 and v2 implementations behind a shared interface

Duplicate `sessionRpc.ts`, `promptTurn.ts`, `sessionUpdateReducer.ts` and the activation code per version, behind a `Harness` service interface.

Pros: zero risk to v1.

Cons:

- About twice the code in the most complex modules.
- Every feature (archive, steering, handoff, spawned subagents) is built twice.
- The UI still needs one model, so a normaliser is needed anyway.

Not recommended.

### Prompt turn: the L item

- Today `promptTurn.ts:139-179` runs Send as an Effect that **completes when `session/prompt` responds**.
- The soft-cancel rule (`:18`), the steer fallback ("waits for the ended turn's `session/prompt` response", `:110, 298-301`), turn-end attention (`notifyAttention.ts`), handoff (`handoff.atoms.ts:60`), spawned subagent settlement (`spawnedSubagent/lifecycle.ts:185-213`) and `closeOrphanedToolCalls` (`sessionRpc.ts:364-376`) all depend on it.
- On v2:
  - The response only means "inserted".
  - The turn ends with `state_update` `idle`, which can come before or after the response.
  - "Clients MUST NOT … assume that a successful response means the session is idle" ([migration guide](https://agentclientprotocol.com/protocol/v2/migration.md)).
  - Work can start with no prompt at all (agent-initiated `running`).
  - A failure after insertion is `idle` + `stopReason: "error"`, not a JSON-RPC error. hoa's `RequestErrorItem` path (`promptTurn.ts:32, 222`) then needs a second source.
- The change: Send resolves on `(response OK) AND (idle for this session)`. On v1 the response itself emits the synthetic idle. hoa also needs an "agent working" state that is not tied to a pending Send.

### Version negotiation and fallback

The rules, from [v2 initialization](https://agentclientprotocol.com/protocol/v2/initialization.md) and `protocol-router.d.ts:4-30`:

- The agent selects the highest supported version ≤ requested, or rejects with `-32022 { requested, supported }`.
- The client MUST check that it supports the returned version.
- It MAY repeat `initialize` before any other request. A v2 router answers a lower repeat with `-32022`, so in practice it opens a new connection.

Proposed client algorithm:

1. Read the provider's pinned version. **Antigravity and Cursor: request v1 only, never probe.**
2. Pinned v1: today's path, unchanged.
3. Pinned v2: send a v2 `initialize` (`protocolVersion: 2`, `info`, `capabilities`).
   - The response has `protocolVersion: 2` **and** a v2 shape (`info` and `capabilities` present): use v2.
   - The response has `protocolVersion: 1`, or a v1 shape whatever the number (the Antigravity case): **kill the child and respawn with a v1 `initialize`**. Do not continue on that connection. A v1 agent "MUST ignore parameters it can't parse", so it dropped hoa's AIR identity, subagent offer and elicitation offer ([initialization](https://agentclientprotocol.com/protocol/v2/initialization.md); _guide summary_). Log a warning and record `acp.protocol_version=1` on the harness span.
   - `-32022` with `supported` containing 1: respawn on v1. Containing neither: fail as a harness error, "Agent speaks ACP {supported}".
4. Cache the negotiated version per runtime version, so later launches skip the failed attempt.
5. Tests can force each branch on Claude with `CLAUDE_AGENT_ACP_PROTOCOL=v1|v2|auto`. `v2` rejects a v1 client, and `v1` negotiates a v2 client down (`serve.js:6-17, 38-56`; read at `index.js:83`).

## 5. Effort estimate

Rough sizes for one engineer who knows the codebase. S ≈ 1-2 days, M ≈ 3-5 days, L ≈ 6-8 days.

| #   | Piece                                                                                                                                                            | Size | Notes                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| 1   | Per-provider `acpProtocol` quirk, minimum adapter version gate, negotiation and respawn fallback, `acp.protocol_version` telemetry                               | S    | `backendHarness.ts`, `agentCapabilities.ts`, `acpLaunchCommand.ts`                |
| 2   | `effect-acp` v2 schemas and RPC groups; `connectAcpAgent` over a group pair; v2 extension groups (`set_title`, `fork`, `_session/*` for Codex)                   | M    | Schemas are hand-written; the SDK 2.12.0 `schema/v2/schema.json` is the reference |
| 3   | Capability, info and auth normalisation (`agentCapabilitiesFrom`, `clientCapabilitiesFor`, `acpSessionBootstrap`)                                                | S    |                                                                                   |
| 4   | Session update normaliser (upserts, `null` vs omitted, message upserts, plan, config rename, terminal output to tool rows, `replay_complete`, subagent RFD form) | M-L  | Pure and testable; the biggest unknown is the real v2 streams                     |
| 5   | Event-driven Prompt turn (`state_update`), v1 synthetic idle, steer and cancel semantics, error `stopReason`, attention, handoff and spawned-subagent consumers  | L    | Five consumer modules; regression risk on v1                                      |
| 6   | Activation: `load` → `resume` + `replayFrom`, `replay_complete` → the existing replay-end path                                                                   | S    |                                                                                   |
| 7   | Permission (`title` / `subject`) and elicitation shape adapters                                                                                                  | S    |                                                                                   |
| 8   | Parity gating: hide archive and the archived filter on Claude v2, rename via `set_title`, steer via prompt, `sessionFailure` absent                              | M    | Includes the product decision                                                     |
| 9   | v2 fixtures (record Claude and Codex), normaliser unit tests per version, an `it.effect` harness test per version and fallback branch                            | M    | No v2 fixtures exist today                                                        |
| 10  | (Deferrable) Use v2-only features: background work panel, `tool_call/cancel` / `terminal/cancel`, `idempotencyKey` on retry, `paused` status                     | M    | Not needed for parity                                                             |

- **MVP (items 1-7 and 9, Codex only on v2):** 20-34 days, so about 4-7 weeks.
- **Both Claude and Codex on v2 with parity gating (adds 8):** 23-39 days, so about 5-8 weeks.
- **With item 10 (v2-only features):** 26-44 days, so about 5-9 weeks.

### Risks

- **Preview churn.**
  - v2 is "not frozen".
  - Three SDK releases came out on 2026-11-24.
  - Claude 0.112.0 pins SDK 2.12.0 while Codex 2.12.0 pins `~2.9.1`, so the two adapters already track different Previews.
  - Codex added v2 in 2.1.0, reverted it, and re-added it in 2.3.0 ("add ACP v2 support again"). It closed gaps in 2.11.0 (2026-11-23) ([CHANGELOG](https://github.com/agentclientprotocol/codex-acp/blob/main/CHANGELOG.md)).
  - Mitigations: pin adapter versions (hoa already installs exact runtimes), gate v2 per minimum adapter version, and keep the v1 path as a one-setting rollback.
- **Antigravity.**
  - 1.5.2 claims any version it is asked for. The v2-looking strings in the binary are bundled Python ACP SDK types: `ReplayFromStartVariant`, links to `protocol/v2/draft/...`, and `auth/login` in docstrings. They are not a v2 server: there are no `replay_complete`, `tool_call/cancel` or `idempotencyKey` strings, and the body stays v1.
  - Pin it to v1 and never send it v2.
  - Unverified: whether a future build fixes negotiation. Re-probe on each registry bump. (An older 1.3.0 build found on this machine under another app's runtime dir also has no v2 method strings.)
- **Claude feature loss on v2.** Archive, the archived filter, `sessionFailure`, `_session/goal` and the AIR session index are absent from the Claude v2 core (see [Feature parity](#feature-parity-per-provider-and-version)). Moving Claude to v2 today regresses the History nav.
- **Turn-model regression.** Item 5 changes v1 behaviour for every provider. It needs harness tests before the refactor.
- **Subagent routing.** v2 uses only the RFD form. `session_message` / `session_message_chunk` routing to child sessions was never verified in hoa (`sessionUpdateReducer.ts:847-850`).
- **Tool output.** If v2 adapters send Bash output only through `terminal_update` / `terminal_output_chunk`, tool rows lose `resultText` unless the normaliser folds it in. Unverified live.
- **AIR differences.** On v2, Codex offers `sessionFailure`, `agentFileChangeReport`, `customInstructions`, `recommendedValue` and the session index. Claude offers only `agentFileChangeReport` and `recommendedValue`. The AIR declaration must move into `capabilities._meta.jetbrains.air` on v2. That location is inferred from Claude `v2/air.js:10-17` (`airSupport(capabilities)`) and not verified live.
- **Test coverage.**
  - All fixtures are v1.
  - The Codex v2 live probe could not run here (missing optional dependency in the runtime).
  - Record real v2 sessions (prompt, tool, permission, subagent, cancel, resume with replay) for both adapters before writing the normaliser.

## Open questions

- Does Claude's v2 core plan to regain archive, the session index and `sessionFailure`? Its v1 core still has them. Check the claude-agent-acp issues before choosing which provider goes to v2 first.
- Codex v2 live behaviour (initialize `_meta`, terminal output path, subagent form) is unverified, because the probe failed in this runtime.
- Cursor's (`cursor-acp`, the user's `cursor-agent` on PATH) v2 support was not checked. Keep it on v1.
- v2 sections read only as a summary: per-method retry classes, idempotency-key rules, and the full `session/resume` contract. Fetch `protocol/v2/session-setup.md`, `prompt-lifecycle.md` and `error.md` before implementing items 5-6.

## Sources

- Spec: [llms.txt](https://agentclientprotocol.com/llms.txt), [v2 Preview announcement](https://agentclientprotocol.com/announcements/acp-v2-preview) (2026-11-20), [v2 migration guide](https://agentclientprotocol.com/protocol/v2/migration.md), [v2 initialization](https://agentclientprotocol.com/protocol/v2/initialization.md).
- SDK `@agentclientprotocol/sdk@2.12.0` (npm tarball):
  - `schema/v1/schema.json` and `schema/v2/schema.json` (`$defs`: `SessionUpdate`, `StateUpdate`, `BackgroundWork`, `ReplayComplete`, `InitializeRequest/Response`, `ClientCapabilities`, `AgentCapabilities`, `SessionCapabilities`, `PromptResponse`, `RequestPermissionRequest`, `RequestPermissionSubject`, `Diff`, `DiffPatch`, `ToolCallUpdate`, `ToolCallStatus`, `TerminalUpdate`, `SessionConfigOption`, `ErrorData`, `UnsupportedProtocolVersionErrorData`)
  - `dist/v1/stable/methods.d.ts`, `dist/v2/stable/methods.d.ts`, `dist/protocol-router.d.ts:4-67`, `dist/v1/bindings.d.ts:676`, `dist/v2/bindings.d.ts:1204`, `MIGRATION_STABLE_UNSTABLE.md`
- SDK installed in hoa: `libs/effect-acp/node_modules/@agentclientprotocol/sdk/package.json` (1.9.0, `exports` `./experimental/v2`). Catalog: `pnpm-workspace.yaml:29`.
- Claude adapter 0.112.0 (`~/.hoa/providers/claude-agent-acp/runtime/0.112.0/node_modules/@agentclientprotocol/claude-agent-acp/`):
  - `package.json` (SDK 2.12.0); `dist/serve.js:1-56`; `dist/index.js:83`
  - `dist/v2/agent.js:55-96, 143, 517-522`; `dist/v2/initialize.js:1-43`; `dist/v2/air.js:1-29`; `dist/v2/session.js:1-30`
  - Upstream README: <https://github.com/agentclientprotocol/claude-agent-acp>
- Codex adapter 2.12.0 (`~/.hoa/providers/codex-acp/runtime/2.12.0/node_modules/@agentclientprotocol/codex-acp/`):
  - `package.json` (SDK `~2.9.1`)
  - `dist/index.js:28662` (`PROTOCOL_VERSION2`), `:31021-31054` (v2 initialize validation), `:53320` (`initializeV2`), `:53370-53412` (AIR list by version), `:59010` (v1 handlers), `:59019` (v2 handlers), `:59025-59034` (router)
  - [CHANGELOG](https://github.com/agentclientprotocol/codex-acp/blob/main/CHANGELOG.md) (2.1.0 add/revert, 2.3.0, 2.6.0, 2.8.0, 2.9.0, 2.11.0)
- Antigravity:
  - Registry entry `agentclientprotocol/registry` `antigravity-acp/agent.json` (1.5.2, no protocol field).
  - Binary `agy-acp-server-1.5.2-darwin-arm64.zip` (sha256 matches the registry), probed on 2026-11-24 with `initialize` at `protocolVersion` 1, 2 and 7. Each answer echoed the requested version with a v1 body.
- hoa: paths and lines inline above (`libs/effect-acp/src`, `libs/ui/src`, `apps/desktop`).

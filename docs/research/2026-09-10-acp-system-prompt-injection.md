# ACP system-prompt injection: Untitled-1 validation + this repo’s path

Date: 2026-09-10  
Question: Which Untitled-1 claims about injecting custom system prompts for Gemini CLI (`gemini --acp`), Claude ACP (`@agentclientprotocol/claude-agent-acp`), and Codex ACP (`@agentclientprotocol/codex-acp`) are correct? And how should **agent-orchestrator** inject a custom system prompt using its existing ACP communications paradigm (`libs/effect-acp` → `session/new` / spawn env), not only offline CLI config files?

Prior art: [`docs/research/2026-09-03-acp-system-prompt-customization.md`](./2026-09-03-acp-system-prompt-customization.md) (Claude/Codex depth). This note **re-verifies** against the adapter versions vendored here and **adds Gemini + this-repo wiring**.

**Vendored adapter versions** (`apps/desktop/acp-adapter-resources/package.json`):

| Package                                 | Version  |
| --------------------------------------- | -------- |
| `@agentclientprotocol/claude-agent-acp` | `0.73.0` |
| `@agentclientprotocol/codex-acp`        | `1.8.0`  |

Gemini is launched as PATH binary `gemini --acp` (no npm adapter in this tree).

## Summary

**ACP v1 still has no first-class system-prompt field.** Clients may attach agent-private data on `_meta` (allowed on `session/new` and almost every other type). Only Claude’s adapter among these three reads a prompt-related `_meta` key today.

| Backend                     | True ACP path (`_meta` on `session/new`)?                                                           | What works for agent-orchestrator today                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude** `0.73.0`         | **Yes** — `_meta.systemPrompt` (**camelCase**)                                                      | Prefer `{ append: "…" }` on `session/new`. String = full replace. Also CLAUDE.md via adapter’s fixed `settingSources: ["user","project","local"]`.                     |
| **Codex** `1.8.0`           | **No** — `newSession` does not map prompt/`_meta` into `baseInstructions` / `developerInstructions` | Spawn-time `CODEX_CONFIG` JSON (process-wide), and/or `AGENTS.md` / `.codex/config.toml` under session `cwd` (and Codex home).                                         |
| **Gemini** (`gemini --acp`) | **No** — `newSession` only uses `cwd` + `mcpServers`; `_meta` not used for prompts                  | Process/env: `GEMINI_SYSTEM_MD` (full replace via markdown file). Project `.gemini/.env` can set it when `loadSettings(sessionCwd)` runs. **No** `_meta.systemPrompt`. |

**This client today** (`apps/desktop/src/acp/sessionRpc.ts`):

```ts
agent['session/new']({ cwd, mcpServers: [] });
```

`NewSessionRequest` in `libs/effect-acp` already types optional `_meta` — no schema change required to send Claude’s extension. Desktop just does not pass it yet. Claude/Codex spawn via `acpAdapterCommand.ts` only sets `CLAUDE_CODE_EXECUTABLE` / `CODEX_PATH`. Gemini spawn (`backendHarness.ts`) is `gemini --acp` with `extendEnv: true` and no prompt env. `gemini-cli` is typed but commented out of `ALL_AGENT_LAUNCH_TARGETS`.

### Verdict table vs Untitled-1

| Untitled-1 claim                                                                            | Verdict                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Gemini `GEMINI_SYSTEM_MD` completely swaps root system prompt                               | ✅ Right                                                                                                                     |
| Point it at a custom markdown file before `gemini --acp`                                    | ✅ Right (env at process start; absolute path safest)                                                                        |
| Persistent alternative: `.gemini/.env` with that var                                        | ✅ Mostly right (CLI docs + `loadSettings`/`loadEnvironment`); ⚠️ process cwd vs session cwd caveat for relative `system.md` |
| Claude instructions are **supplemented** (appended), not full replace                       | ❌ Oversimplified / wrong as blanket claim                                                                                   |
| Claude method: `--append-system-prompt` OR workspace `CLAUDE.md`                            | ⚠️ Partial: CLAUDE.md yes via ACP adapter; `--append-system-prompt` is Claude Code **CLI**, not the ACP `_meta` path         |
| Claude advanced: `_meta` extension params during session init                               | ✅ Right if “session init” = `session/new` (`_meta.systemPrompt`)                                                            |
| Codex override via `.codex/config.toml` `model_instructions_file`                           | ✅ Right as Codex **core** config (discouraged by Codex itself)                                                              |
| Or `CODEX_CONFIG='{"model_instructions_file":"…"}'` when spawning npm adapter               | ✅ Plausible / supported shape: `CODEX_CONFIG` is JSON merged into session config (`1.8.0`); same process-wide scope         |
| Protocol `_meta.system_prompt` belongs on `session/new` not `initialize`                    | ⚠️ Half-right: no protocol key at all; Claude reads prompt meta on **`session/new`**; `_meta` is allowed on both             |
| Snake_case `_meta.system_prompt` string works                                               | ❌ Wrong for Claude `0.73.0` (key is **`systemPrompt`**)                                                                     |
| Object form `{ type: "preset", preset: "claude_code", append: "…" }` works on some adapters | ✅ Right for Claude; adapter forces `type`/`preset` back to `claude_code` and keeps `append`                                 |

## Validation of prior summary (claim-by-claim)

### Gemini CLI (`gemini --acp`)

1. **`GEMINI_SYSTEM_MD` completely swaps root system prompt** — ✅  
   Official docs: full replacement, not a merge ([`docs/cli/system-prompt.md`](https://github.com/google-gemini/gemini-cli/blob/f8541cf7/docs/cli/system-prompt.md)). Core reads `process.env['GEMINI_SYSTEM_MD']` in `getCoreSystemPrompt` and, when enabled, replaces `basePrompt` with file contents ([`packages/core/src/core/prompts.ts`](https://github.com/google-gemini/gemini-cli/blob/e79b149/packages/core/src/core/prompts.ts)).

2. **Point it at a custom markdown file before `gemini --acp`** — ✅  
   Same docs: path value, or `1`/`true` for `./.gemini/system.md`. ACP mode is the same process (`gemini --acp`); prompt construction is core-level, not a separate ACP-only prompt API ([`docs/cli/acp-mode.md`](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/acp-mode.md), `prompts.ts`).

3. **Persistent alternative: `.gemini/.env`** — ✅ with caveat  
   Docs recommend persisting via `.gemini/.env`. `loadSettings(workspaceDir)` calls `loadEnvironment(..., workspaceDir)`, which walks from that workspace for `.gemini/.env` / `.env` ([`packages/cli/src/config/settings.ts`](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/settings.ts)). ACP `newSession` calls `loadSettings(cwd)` with the **session** cwd ([`packages/cli/src/acp/acpClient.ts`](https://github.com/google-gemini/gemini-cli/blob/07ab16db/packages/cli/src/acp/acpClient.ts)).  
   **Caveat:** default/relative `system.md` resolution in `getCoreSystemPrompt` uses `path.resolve(...)` against **process.cwd()**, not necessarily session `cwd`. For this desktop harness (spawn with no child `cwd`), prefer an **absolute** `GEMINI_SYSTEM_MD` path in spawn env.

4. **Gemini honors `_meta` system prompt on `session/new`?** — ❌ Not found  
   `newSession({ cwd, mcpServers })` does not read `_meta` for prompts. Observed `_meta` use is auth (`api-key`), not system prompt (`acpClient.ts`).

### Claude (`@agentclientprotocol/claude-agent-acp` `0.73.0`)

5. **System instructions are only supplemented (appended)** — ❌  
   Installed `dist/acp-agent.js`: default `{ type: "preset", preset: "claude_code" }`; if `_meta.systemPrompt` is a **string**, it **replaces** the entire system prompt; if it is a non-array **object**, it is spread with `type`/`preset` forced back to `claude_code` (so `append` / `excludeDynamicSections` work). CLAUDE.md is a **separate** SDK path (project context via `settingSources`), not the same as system-prompt append ([Claude Agent SDK: Modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)).

6. **Method: `--append-system-prompt` OR workspace `CLAUDE.md`** — ⚠️
   - `CLAUDE.md`: ✅ adapter always sets `settingSources: ["user", "project", "local"]` when creating the SDK query options (`acp-agent.js`).
   - `--append-system-prompt`: Claude Code **CLI** flag — **not** what the ACP adapter documents or reads. ACP equivalent is `_meta.systemPrompt: { append: "…" }` on `session/new`.

7. **Advanced: `_meta` during session init** — ✅  
   Runtime key: **`params._meta.systemPrompt`** (camelCase). Note: exported `NewSessionMeta` in `acp-agent.d.ts` documents `claudeCode` / `additionalRoots` but **omits** `systemPrompt` from the type — runtime still honors it. Historical issue used snake_case naming in the proposal ([issue #90](https://github.com/agentclientprotocol/claude-agent-acp/issues/90)); **shipped key is camelCase**.

### Codex (`@agentclientprotocol/codex-acp` `1.8.0`)

8. **`.codex/config.toml` with `model_instructions_file`** — ✅ as Codex product config  
   Codex core config defines `model_instructions_file` as an optional path that **overrides built-in model instructions**, and marks users as strongly discouraged from using it ([`codex-rs/config/src/config_toml.rs`](https://github.com/openai/codex/blob/178c3d30/codex-rs/config/src/config_toml.rs)). Project/home `.codex` dirs are the normal Codex config surface (also referenced in adapter error text).

9. **`CODEX_CONFIG='{"model_instructions_file":"…"}'` when spawning** — ✅ mechanism exists  
   README: `CODEX_CONFIG` — JSON object merged into the Codex session config. Startup parses `process.env["CODEX_CONFIG"]` and passes that object into `CodexAcpClient`; `createSessionConfig` spreads `this.config` into the config sent on `threadStart` (`dist/index.js`, README). Adapter **`newSession` does not** pass `baseInstructions` / `developerInstructions` from ACP `_meta` (only `config`, `modelProvider`, `cwd`). So instruction override via ACP `_meta` remains unavailable; process-level `CODEX_CONFIG` / files under cwd remain the knobs. Prefer `AGENTS.md` for project guidance unless a true base-instruction replace is intended (see 09-03 note).

### Protocol `_meta.system_prompt`

10. **Belongs on `session/new` not `initialize`** — ⚠️  
    Protocol: `_meta` is allowed on essentially all types ([extensibility](https://agentclientprotocol.com/protocol/v1/extensibility.md); [`NewSessionRequest`](https://agentclientprotocol.com/protocol/v1/schema.md)). There is **no** standard `system_prompt` / `systemPrompt` field. Claude’s agent-private convention is read from **`session/new` params**, not from `initialize`.

11. **Snake_case `_meta.system_prompt` string works** — ❌ for Claude `0.73.0`  
    Code checks `params._meta?.systemPrompt` only. Snake_case would be ignored.

12. **Object form `{ type: "preset", preset: "claude_code", append: "…" }` works on some adapters** — ✅ Claude only among these three  
    Object branch spreads custom fields then locks `type`/`preset`. Codex/Gemini do not implement this.

## ACP protocol surface

Primary sources: [llms.txt](https://agentclientprotocol.com/llms.txt), [session-setup](https://agentclientprotocol.com/protocol/v1/session-setup.md), [schema `NewSessionRequest`](https://agentclientprotocol.com/protocol/v1/schema.md), [extensibility](https://agentclientprotocol.com/protocol/v1/extensibility.md).

`session/new` first-class params: `cwd`, `mcpServers`, optional `additionalDirectories`, optional `_meta`. No system/developer prompt. Modes/config options are selectors, not free-form instruction text. Prompt turns carry user content blocks only.

## Per-agent findings (primary sources)

### Claude — `@agentclientprotocol/claude-agent-acp@0.73.0`

| Mechanism                                                           | Effect                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| omit `_meta.systemPrompt`                                           | `{ type: "preset", preset: "claude_code" }`                              |
| `_meta.systemPrompt: "…"`                                           | **Full replace**                                                         |
| `_meta.systemPrompt: { append: "…" }` (and/or other preset options) | Preset + append; caller `type`/`preset` overwritten to `claude_code`     |
| CLAUDE.md / settings                                                | Loaded because adapter sets `settingSources: ["user","project","local"]` |
| `_meta.claudeCode.options`                                          | Separate SDK options forward path (not the primary prompt knob)          |

Key casing: **`systemPrompt`**, not `system_prompt`.

### Codex — `@agentclientprotocol/codex-acp@1.8.0`

| Mechanism                                                  | Effect                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `_meta.systemPrompt` / instruction fields on `session/new` | **Not wired** into `threadStart`                                 |
| `CODEX_CONFIG` env JSON                                    | Merged into session `config` for every new thread (process-wide) |
| `.codex/config.toml` / `model_instructions_file`           | Codex core override of built-in instructions (discouraged)       |
| `AGENTS.md` under session cwd                              | Project developer-context path (see 09-03)                       |

### Gemini — `gemini --acp`

| Mechanism                            | Effect                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `GEMINI_SYSTEM_MD`                   | Full replace of core system prompt from markdown file                                      |
| `.gemini/.env`                       | Can set `GEMINI_SYSTEM_MD`; loaded via `loadSettings`/`loadEnvironment` from workspace dir |
| `_meta` on `session/new` for prompts | **Not supported** (auth `_meta` only in observed ACP client)                               |
| `GEMINI.md`                          | Project “strategy” guidance (docs contrast with `system.md` “firmware”); not ACP `_meta`   |

## Injection via this repo’s ACP paradigm

### What the client sends today

- Connect/spawn: `apps/desktop/src/acp/backendHarness.ts` → `makeAcpAdapterCommand` (Claude/Codex) or `gemini --acp`.
- Create session: `apps/desktop/src/acp/sessionRpc.ts` → `agent['session/new']({ cwd, mcpServers: [] })` — **no `_meta`**.
- Schema: `libs/effect-acp/src/schema/agent.ts` `NewSessionRequest` includes `_meta: MetaField` (`Record<string, unknown> | null | omitted`). Encoding already allows Claude’s extension without schema changes.

### Per-agent mapping for _this_ harness

| Agent      | Preferred injection in-repo                                                                                                                                | Layer                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Claude** | Extend `createSession` to pass `_meta: { systemPrompt: { append: "…" } }`                                                                                  | True ACP RPC on `session/new`                 |
| **Codex**  | (1) Ensure session `cwd` has desired `AGENTS.md`; and/or (2) pass `CODEX_CONFIG` in `makeAcpAdapterCommand` spawn `env` (today only `CODEX_PATH`)          | Files under cwd / spawn env — **not** `_meta` |
| **Gemini** | Pass `GEMINI_SYSTEM_MD=<absolute path>` in spawn `env` when enabling `gemini-cli`; optionally rely on session-cwd `.gemini/.env` after `loadSettings(cwd)` | Spawn env / Gemini files — **not** `_meta`    |

### Correct key casing

| Claimed               | Actual (Claude 0.73.0) |
| --------------------- | ---------------------- |
| `_meta.system_prompt` | ❌ ignored             |
| `_meta.systemPrompt`  | ✅                     |

Object form with `append` is valid; string form is replace, not append.

## Recommended approach for agent-orchestrator

1. **Claude (first, true ACP path):** In `createSession`, when `launchTarget === 'claude-agent-acp'`, pass `_meta.systemPrompt: { append: "<orchestrator instructions>" }`. Keep string replace only if intentionally owning the full prompt. No Effect schema change needed.
2. **Codex:** Do not invent a shared `_meta.systemPrompt` until codex-acp maps it. Use `AGENTS.md` at session cwd for shared project instructions; use spawn `CODEX_CONFIG` only for process-wide overrides. Avoid `model_instructions_file` unless deliberately replacing Codex base instructions (Codex discourages it).
3. **Gemini:** No `_meta` path. When mounting `gemini-cli`, set spawn env `GEMINI_SYSTEM_MD` to an **absolute** markdown path (or document that project `.gemini/.env` + `.gemini/system.md` must align with how Gemini resolves paths vs process cwd).
4. **Do not** send snake_case `system_prompt`. **Do not** put the Claude prompt on `initialize` and expect Claude to apply it as session system prompt.
5. Keep agent-specific branching in the desktop harness rather than pretending ACP v1 has one portable prompt field.

## Sources checklist

| Claim                                               | Source                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ACP `session/new` / no prompt field                 | https://agentclientprotocol.com/protocol/v1/session-setup.md , schema.md                                                      |
| `_meta` extensibility                               | https://agentclientprotocol.com/protocol/v1/extensibility.md                                                                  |
| Claude `_meta.systemPrompt` runtime                 | vendored `…/claude-agent-acp/dist/acp-agent.js` (~5187–5311), package `0.73.0`                                                |
| Claude `NewSessionMeta` typedef gap                 | vendored `…/claude-agent-acp/dist/acp-agent.d.ts`                                                                             |
| Claude SDK append vs replace / CLAUDE.md            | https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts                                                            |
| Claude historical snake_case proposal               | https://github.com/agentclientprotocol/claude-agent-acp/issues/90                                                             |
| Codex `CODEX_CONFIG` + `newSession` → `threadStart` | vendored `…/codex-acp/README.md`, `dist/index.js` (`1.8.0`)                                                                   |
| Codex `model_instructions_file`                     | https://github.com/openai/codex/blob/178c3d30/codex-rs/config/src/config_toml.rs                                              |
| Gemini `GEMINI_SYSTEM_MD`                           | https://github.com/google-gemini/gemini-cli/blob/f8541cf7/docs/cli/system-prompt.md ; `packages/core/src/core/prompts.ts`     |
| Gemini ACP `newSession` / no prompt `_meta`         | https://github.com/google-gemini/gemini-cli/blob/07ab16db/packages/cli/src/acp/acpClient.ts ; acp-mode.md                     |
| Gemini `.env` load from workspace                   | https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/settings.ts (`loadEnvironment` / `findEnvFile`) |
| This repo session create / spawn                    | `apps/desktop/src/acp/sessionRpc.ts`, `acpAdapterCommand.ts`, `backendHarness.ts`, `agentLaunchTarget.ts`                     |
| Effect `_meta` on SessionNew                        | `libs/effect-acp/src/schema/agent.ts`, `common.ts`                                                                            |
| Prior Claude/Codex research                         | `docs/research/2026-09-03-acp-system-prompt-customization.md`                                                                 |

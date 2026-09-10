# Customizing the initial system prompt for Claude and Codex over ACP v1

Date: 2026-09-03
Question: How can an ACP client customize the initial system prompt for both [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp) and [`codex-acp`](https://github.com/agentclientprotocol/codex-acp), given ACP v1?

## Summary

**ACP v1 has no first-class system-prompt / instructions field.** `session/new` takes `cwd`, `mcpServers`, optional `additionalDirectories`, and `_meta`. Extensibility is via `_meta` and underscore methods, not a protocol prompt API.

| Backend | Per-session system/developer prompt over ACP? | Practical knob |
| --- | --- | --- |
| **Claude** (`claude-agent-acp`) | Yes — `_meta.systemPrompt` on `session/new` | Append to `claude_code` preset, or replace with a string; also CLAUDE.md via `settingSources` |
| **Codex** (`codex-acp`) | No — adapter does not forward instruction fields | `AGENTS.md` under session `cwd`, and/or process-level `CODEX_CONFIG` (`instructions` / `developer_instructions`) |

**Recommended default (ponytail) for this repo’s desktop harness:** for Claude, pass `_meta.systemPrompt: { append: "…" }` on `session/new`. For Codex, put shared project instructions in `AGENTS.md` at the session cwd (already how Codex works). Do not invent a fake shared ACP field until codex-acp exposes `baseInstructions` / `developerInstructions`.

This repo currently creates sessions with only `{ cwd, mcpServers: [] }` — no `_meta` (`apps/desktop/src/acp/agentHarness.ts`).

## ACP v1 surface

Primary sources:

- Index: https://agentclientprotocol.com/llms.txt
- Session setup (`session/new` params): https://agentclientprotocol.com/protocol/v1/session-setup.md
- Schema (`NewSessionRequest`): https://agentclientprotocol.com/protocol/v1/schema.md
- Extensibility (`_meta`, `_` methods): https://agentclientprotocol.com/protocol/v1/extensibility.md
- Session modes (modes “often affect the system prompts used” — agent-defined, not free-form prompt text): https://agentclientprotocol.com/protocol/v1/session-modes.md
- Session config options (select/boolean selectors only): https://agentclientprotocol.com/protocol/v1/session-config-options.md
- Prompt turn (user content blocks only; no system role): https://agentclientprotocol.com/protocol/v1/prompt-turn.md

### What the protocol does *not* define

- No `systemPrompt`, `instructions`, `developerInstructions`, or `baseInstructions` on `session/new`, `session/load`, `session/resume`, or `session/prompt`.
- Config options are UX selectors (`mode`, `model`, `thought_level`, …), not arbitrary prompt strings.
- Customization must use agent-specific `_meta`, filesystem conventions the underlying runtime already loads, process env/config, or (weakly) the first user message.

## Claude — `@agentclientprotocol/claude-agent-acp`

Repos:

- https://github.com/agentclientprotocol/claude-agent-acp
- Implementation: `src/acp-agent.ts` (`systemPrompt` construction around the `session/new` → SDK `query` options)
- Tests: `src/tests/create-session-options.test.ts` (`describe("systemPrompt via _meta")`)
- Claude Agent SDK docs: https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts

### Default

If `_meta.systemPrompt` is omitted:

```ts
systemPrompt = { type: "preset", preset: "claude_code" }
```

The adapter also always sets `settingSources: ["user", "project", "local"]`, so CLAUDE.md / project settings under the session cwd load alongside the preset.

### Per-session customization: `_meta.systemPrompt`

| Value | Effect (from adapter + tests) |
| --- | --- |
| omitted | `claude_code` preset |
| string | **Replaces** the entire system prompt |
| `{ append: "…" }` | Keep `claude_code` preset and append text |
| `{ excludeDynamicSections: true }` | Forwarded on the preset (SDK cache-friendly env handling) |
| object with caller `type` / `preset` | Those keys ignored; forced back to `type: "preset", preset: "claude_code"` |

Example:

```ts
await agent["session/new"]({
  cwd: projectRoot,
  mcpServers: [],
  _meta: {
    systemPrompt: {
      append: "You are the agent-orchestrator desktop harness…",
      excludeDynamicSections: true,
    },
  },
});
```

Prefer **append** over a full string unless the client intentionally owns tools/safety/environment instructions (SDK guidance).

### Project-level (not ACP `_meta`)

With `settingSources` including `project` / `user` / `local`, CLAUDE.md and related Claude Code settings inject project context. SDK treats CLAUDE.md as conversation/project context alongside the chosen system prompt configuration.

### Related `_meta` (not the primary prompt knob)

`_meta.claudeCode.options` can forward additional Claude Agent SDK `Options`. `systemPrompt` is handled separately at the top-level `_meta.systemPrompt` path before options merge; ACP still owns `cwd`, permissions, etc.

## Codex — `@agentclientprotocol/codex-acp`

Repos:

- https://github.com/agentclientprotocol/codex-acp
- README / runtime env: `CODEX_CONFIG` (JSON merged into Codex session config)
- `src/index.ts` — parses `process.env.CODEX_CONFIG`
- `src/CodexAcpClient.ts` — `newSession` → `threadStart({ config, modelProvider, cwd })` only
- `src/CollaborationModeConfig.ts` — collaboration mode always sets `developer_instructions: null`
- Underlying Codex App Server types: `src/app-server/v2/ThreadStartParams.ts` (`baseInstructions`, `developerInstructions`)
- Codex product behavior: AGENTS.md injection into developer message ([openai/codex](https://github.com/openai/codex))

### Gap: ACP does not expose per-thread instructions

Codex App Server `thread/start` (and resume/fork) accept:

- `baseInstructions?: string | null`
- `developerInstructions?: string | null`

The ACP adapter’s `newSession` does **not** pass these. The only adapter use of `developerInstructions` found is the internal agent file-change-report fork (`AGENT_FILE_CHANGE_REPORT_DEVELOPER_INSTRUCTIONS`). There is no `_meta.systemPrompt` (or equivalent) path like Claude’s.

Collaboration-mode updates also hard-code `developer_instructions: null`.

### What works today without changing the adapter

1. **`AGENTS.md` under the session `cwd`** (and ancestors / `CODEX_HOME/AGENTS.md`)
   - Codex includes applicable AGENTS.md content with the developer message.
   - Deeper files override shallower on conflict; direct system/developer/user instructions beat AGENTS.md.
   - Closest “project initial instructions” path that both CLI and ACP sessions share when cwd matches.

2. **Process-level `CODEX_CONFIG`**
   - Env var: JSON object merged into the config passed to `thread/start`.
   - Codex core config resolves persistent `instructions` (→ base instructions) and `developer_instructions` (and optional `model_instructions_file`).
   - Scope is the ACP agent process, not a per-`session/new` client field.

   ```bash
   CODEX_CONFIG='{"developer_instructions":"…","instructions":"…"}' npx -y @agentclientprotocol/codex-acp
   ```

3. **Modes / first user message / steering**
   - Agent modes change approval/sandbox behavior, not a custom system prompt string.
   - First `session/prompt` or `_session/steering` can soft-steer; not equivalent to system/developer instructions.

### If per-session Codex instructions are required

Shortest real fix is in **codex-acp** (or a fork): map something like `_meta.baseInstructions` / `_meta.developerInstructions` from `session/new` into `threadStart({ …, baseInstructions, developerInstructions })`. The wire fields already exist under the adapter; they are just unused on the ACP path.

## Comparison matrix (client perspective)

| Goal | Claude ACP | Codex ACP |
| --- | --- | --- |
| Per-session append | `_meta.systemPrompt: { append }` | Not exposed; use AGENTS.md or extend adapter |
| Full replace | `_meta.systemPrompt: "…"` | Not exposed; config `instructions` ≈ base, process-wide |
| Project defaults | CLAUDE.md + `settingSources` | AGENTS.md (cwd tree) |
| Process-wide override | Claude settings / env | `CODEX_CONFIG` |
| Protocol-standard field | None (uses `_meta`) | None |

## Implications for `apps/desktop` Agent Chat

Current create path (`createSession` in `agentHarness.ts`):

```ts
agent["session/new"]({ cwd, mcpServers: [] })
```

To customize:

- **Claude:** extend the create-session call with `_meta.systemPrompt` (append preferred).
- **Codex:** point session `cwd` at a tree that contains the desired `AGENTS.md`, and/or spawn the Codex ACP process with `CODEX_CONFIG`. Do not expect `_meta.systemPrompt` to work until the adapter grows that mapping.

Avoid inventing a single shared ACP field in the client unless both adapters agree on a `_meta` shape; today only Claude documents/tests `systemPrompt`.

## Sources checklist

| Claim | Source |
| --- | --- |
| ACP `session/new` fields | https://agentclientprotocol.com/protocol/v1/session-setup.md , schema.md |
| `_meta` extensibility | https://agentclientprotocol.com/protocol/v1/extensibility.md |
| Modes affect system prompts (agent-defined) | https://agentclientprotocol.com/protocol/v1/session-modes.md |
| Claude `_meta.systemPrompt` behavior | `claude-agent-acp` `src/acp-agent.ts`, `src/tests/create-session-options.test.ts` |
| Claude SDK prompt customization | https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts |
| Codex `CODEX_CONFIG` | `codex-acp` README, `src/index.ts` |
| Codex `newSession` omits instruction fields | `codex-acp` `src/CodexAcpClient.ts` |
| Codex App Server instruction fields exist | `codex-acp` `src/app-server/v2/ThreadStartParams.ts`; openai/codex app-server protocol |
| Codex AGENTS.md injection | openai/codex protocol / agents_md_manager behavior |
| This repo’s session create | `apps/desktop/src/acp/agentHarness.ts` |

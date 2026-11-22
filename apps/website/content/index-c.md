---
layout: home
title: hoa(1)
---

## NAME

**hoa** — Harness Orchestrating Agents: one desktop home for your coding agents.

## SYNOPSIS

```sh
git clone https://github.com/Harris-Miller/agent-orchestrator.git
cd agent-orchestrator
pnpm install
pnpm run tauri:dev
```

## DESCRIPTION

**hoa** runs coding agents as local subprocesses and drives them over the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP). It embeds no vendor SDK: every agent is a process that speaks ACP on stdin/stdout, and **hoa** is its client.

For each session the Agent Harness spawns the agent, negotiates capabilities, sends your prompts, streams the agent's work back, and fulfills what the agent asks of the client — files, terminals, and your permission.

## AGENTS

| Launch target      | Provider    | Kind                             |
| ------------------ | ----------- | -------------------------------- |
| `codex-acp`        | Codex       | ACP adapter (npm)                |
| `claude-agent-acp` | Claude      | ACP adapter (npm)                |
| `cursor-acp`       | Cursor      | Vendor CLI ACP — _beta flag_     |
| `antigravity-acp`  | Antigravity | Managed ACP binary — _beta flag_ |

## FEATURES

- **Session History** — every agent's sessions, grouped by Project; pin, archive, import, bulk-select.
- **Steer / Queue** — send into a running turn, or hold one message for when it ends.
- **Permission requests** — the agent waits on the session until you answer.
- **Handoff** — continue the work on another agent from a document the first one writes.
- **Spawned subagents** — an agent starts a session on a different agent and gets its result back.
- **VS Code** — the same UI in the Secondary Side Bar.

## FILES

`~/.hoa/settings.json`, `~/.hoa/projects.json`, `~/.hoa/providers/<launch target>/` — see [hoa-home(5)](/reference/hoa-home).

## SEE ALSO

[getting-started(1)](/guide/getting-started), [providers(7)](/guide/providers), [sessions(7)](/guide/sessions), [architecture(7)](/reference/architecture), [glossary(7)](/reference/glossary)

## STATUS

Pre-alpha. No installers; formats change without migration.

---
layout: page
title: Every coding agent, one harness
sidebar: false
aside: false
---

<TerminalHome>

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

**hoa** runs the coding agents you already use — Codex, Claude, and more — side by side in one app. Start a session in any project folder, pick an agent, and talk to it. Every session from every agent lands in one Session History, and every time an agent wants to run a command or needs an answer, it asks you in the same place.

## AGENTS

| Agent       | Availability |
| ----------- | ------------ |
| Codex       | Available    |
| Claude      | Available    |
| Cursor      | Beta         |
| Antigravity | Beta         |

## FEATURES

- **Session History** — every agent's sessions, grouped by Project; pin, archive, import, bulk-select.
- **Steer / Queue** — send into a running turn, or hold one message for when it ends.
- **Permission prompts** — the agent waits until you answer, and HOA can notify you.
- **Handoff** — continue the work on another agent, in the same folder.
- **Subagents** — an agent can ask a different agent for help and get the result back.
- **VS Code** — the same app in VS Code's Secondary Side Bar.

## SEE ALSO

[getting-started](/guide/getting-started), [providers](/guide/providers), [sessions](/guide/sessions), [working-with-agents](/guide/working-with-agents), [handoff-and-subagents](/guide/handoff-and-subagents), [vscode](/guide/vscode)

## STATUS

Pre-alpha. No installers yet; settings can change between versions.

</TerminalHome>

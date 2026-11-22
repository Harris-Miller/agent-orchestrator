# Handoff & subagents

::: warning Experimental
Turn on **Settings › Experimental: App Orchestrated Agents** to use Handoff and subagents. It's off by default.
:::

## Handoff

**Handoff** moves work from one agent to another without copy-paste:

1. Choose **Handoff** on the session and pick the agent to continue on, plus its settings.
2. The current agent writes a handoff document summarizing where things stand.
3. HOA starts a new session on the agent you picked, in the same folder, and gives it the handoff document as its first message.

If the agent finishes its turn without writing the document, the Handoff stops and nothing is created — just try again.

## Subagents

An agent can ask a **different** agent for help — for example, Claude asking Codex for a second opinion. HOA starts that subagent session in the same folder, shows it nested under the session that asked for it, and hands its result back when it finishes.

(When an agent wants help from another copy of _itself_, it uses its own built-in subagents instead.)

## Troubleshooting

Handoff and subagents rely on a small helper process HOA runs in the background on your machine, shared by the desktop app and VS Code. When it can't run, HOA keeps working without these features and shows why Handoff is unavailable. Common causes:

- **Node isn't installed** — see [Getting started](./getting-started#prerequisites).
- **Another program uses its port** — set `hubPort` to a free port number in `~/.hoa/settings.json` and restart HOA.
- **A remote VS Code window** (SSH, containers) — these features only work in local windows.
- **Different HOA versions open at once** — HOA tells you which windows to close.

Sessions opened before you turned the setting on need to be reopened to use these features.

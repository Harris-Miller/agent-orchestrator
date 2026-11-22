# Handoff & subagents

::: warning Experimental
Handoff and spawned subagents are behind **Settings › Experimental: App Orchestrated Agents**, off by default.
:::

## The Hub

Some features need the agent to call _back_ into HOA. HOA offers those calls as MCP tools, served by the **Hub**: one small local process per machine, shared by the desktop app and every VS Code window.

- Each session gets its own credential; the Hub uses it to route the tool call to the app window that owns the session. The tool's logic runs in that window, not in the Hub.
- Whichever app finds no Hub running starts it, and it exits shortly after its last client disconnects.
- It listens on a fixed `127.0.0.1` port. If another program holds that port, set `hubPort` in `~/.hoa/settings.json`.
- Its log is `~/.hoa/logs/hub.log`.

If the Hub can't be used (no Node, port taken, a version mismatch, a remote VS Code window) HOA keeps working without it: Handoff is disabled and the reason is shown.

## Handoff

**Handoff** moves work from one agent to another:

1. HOA asks the current session's agent to write a handoff document and submit it through the Hub's `submit_handoff` tool.
2. HOA creates a new session on the agent you chose, in the same session cwd, with the config options you picked.
3. The new session starts with the handoff document as its first prompt.

If the agent ends its turn without submitting a document, the Handoff fails and nothing is created.

## Spawned subagents

An agent can call the Hub's `spawn_subagent` tool to start a **subagent session** on a _different_ agent — for example Claude asking Codex for a second opinion. (For its own provider, an agent uses its native subagent tool.)

The spawned session is a real session on its own launch target, started in the parent's cwd and prompted with the parent's task. It shows up nested under its parent, exactly like a native subagent, and its result is returned to the parent agent when it finishes. Agents can also list which launch targets are usable and cancel a subagent they started.

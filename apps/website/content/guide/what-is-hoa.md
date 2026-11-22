# What is HOA?

**Harness Orchestrating Agents (HOA)** is a desktop app for working with coding agents. It runs the agents you already use — Codex, Claude, and (in beta) Cursor and Antigravity — as local subprocesses and gives them one shared home: one list of sessions, one composer, one place to answer their permission prompts.

HOA does not embed any vendor's LLM SDK. Every agent is reached through the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP), the open JSON-RPC protocol that lets an editor (the _client_) drive a coding agent (the _agent_) over stdio. HOA is the client.

## The Agent Harness

The core of HOA is the **Agent Harness**. For every session it:

1. spawns the agent as a subprocess and connects to it over stdio,
2. negotiates capabilities (what the agent can do, what HOA offers back),
3. runs the session — sending your prompts and rendering the agent's streamed output,
4. fulfills the requests the agent makes of the client: reading and writing files, running terminal commands, and asking you for permission.

Because the Harness speaks a protocol instead of wrapping an SDK, adding an agent means pointing HOA at another ACP agent, not writing another integration.

## What you get

- **One Session History for every agent.** Sessions are grouped by Project (a directory you bring into the app), across all agents, newest first. Pin, archive, fork, and import sessions an agent already has on disk.
- **Agents that keep working while you type.** Steer an in-flight turn with a new message, or queue one to send when the turn ends.
- **Permission prompts and forms in one place.** When an agent asks to run a command or needs input, the request waits on the session until you answer it.
- **Handoff between agents.** Ask one agent to write a handoff document and continue the work on another agent, in the same directory.
- **Agents that spawn agents.** With App Orchestrated Agents on, an agent can start a subagent session on a _different_ agent and get its result back.
- **The same app in VS Code.** A VS Code extension renders the same UI in the Secondary Side Bar and shares your sessions with the desktop app.

## Status

HOA is **pre-alpha**. There are no published installers yet; you [build it from source](./getting-started). Expect settings, file formats, and features to change without migration.

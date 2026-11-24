# What is HOA?

**Harness Orchestrating Agents (HOA)** is a desktop app for working with coding agents. It runs the agents you already use — Codex, Claude, and (in beta) Cursor and Antigravity — on your own machine and gives them one shared home: one list of sessions, one composer, one place to answer their questions.

## How it works

You pick a Project folder and an agent, and type a prompt. HOA starts the agent on your machine and shows its work as it happens: the files it reads, the edits it makes, the commands it wants to run. Whenever the agent wants to do something that needs your say-so, it asks you in HOA and waits for your answer.

HOA talks to every agent through the open [Agent Client Protocol](https://agentclientprotocol.com/), so each agent works the same way in HOA, whichever vendor makes it.

## What you get

- **One Session History for every agent.** Sessions are grouped by Project, across all agents, newest first. Pin, archive, and import sessions an agent already has on disk.
- **Agents that keep working while you type.** Steer a running turn with a new message, or queue one to send when the turn ends.
- **Permission prompts and questions in one place.** When an agent asks to run a command or needs input, the request waits on the session until you answer it — and HOA can notify you.
- **Handoff between agents.** Ask one agent to write up where it is and continue the work on another agent, in the same folder.
- **Agents that ask other agents for help.** An agent can start a session on a _different_ agent and get its result back.
- **The same app in VS Code.** A VS Code extension shows the same app in the Secondary Side Bar and shares your sessions with the desktop app.

## Status

HOA is in **Alpha**. Installers for macOS and Windows are on [GitHub Releases](https://github.com/Harris-Miller/agent-orchestrator/releases), and installed apps update themselves; see [Getting started](./getting-started). Expect settings and features to change between versions.

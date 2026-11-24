<p align="center">
  <img src="apps/website/content/public/logo.svg" alt="HOA logo" width="96" />
</p>

# Harness Orchestrating Agents (HOA)

**Every coding agent, one harness.** HOA is a desktop app (with a matching VS Code extension) for working with the coding agents you already use: Codex and Claude, plus Cursor and Antigravity in beta. It runs them on your own machine and gives them one shared home: one list of sessions, one composer, one place to answer their questions.

**[Read the docs →](https://harris-miller.github.io/hoa/)**

## What you get

- **One Session History for every agent.** Sessions are grouped by Project, across all agents, newest first. Pin, archive, and import sessions an agent already has on disk.
- **Agents that keep working while you type.** Steer a running turn with a new message, or queue one to send when the turn ends.
- **Permission prompts and questions in one place.** When an agent asks to run a command or needs input, the request waits on the session until you answer it, and HOA can notify you.
- **Handoff between agents.** Ask one agent to write up where it is and continue the work on another agent, in the same folder.
- **Agents that ask other agents for help.** An agent can start a session on a _different_ agent and get its result back.
- **The same app in VS Code.** The extension shows HOA in the Secondary Side Bar and shares your sessions and agent downloads with the desktop app.

HOA talks to every agent through the open [Agent Client Protocol](https://agentclientprotocol.com/), so each agent works the same way whichever vendor makes it. It embeds no vendor SDK: agents run as their own processes, signed in with your own accounts.

## Get HOA

HOA is in **Alpha**. Expect settings and features to change between versions.

- **Download** the macOS or Windows installer from [GitHub Releases](https://github.com/Harris-Miller/hoa/releases). Installed apps update themselves from there.
- **Or build from source:** see [Getting started](https://harris-miller.github.io/hoa/guide/getting-started).

HOA needs **Node.js 22+** and **npm** on your `PATH` (it uses them to download and run agents) and an account with at least one agent provider. See [Agent providers](https://harris-miller.github.io/hoa/guide/providers).

## Feedback and contributing

Report bugs and request features in [GitHub Issues](https://github.com/Harris-Miller/hoa/issues). To work on HOA itself, read [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[ISC](./LICENSE)

---
layout: home
title: Every coding agent, one harness

hero:
  name: HOA
  text: Every coding agent, one harness
  tagline: Run Codex, Claude, Cursor and Antigravity side by side in a desktop app built on the Agent Client Protocol — one Session History, one composer, one place to answer them.
  image:
    src: /logo.svg
    alt: HOA
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is HOA?
      link: /guide/what-is-hoa
    - theme: alt
      text: GitHub
      link: https://github.com/Harris-Miller/agent-orchestrator

features:
  - icon: 🔌
    title: Agents over ACP, not SDKs
    details: Every agent runs as its own subprocess and talks the open Agent Client Protocol. No vendor SDK is embedded, so new agents are a launch target away.
    link: /guide/providers
    linkText: Agent providers
  - icon: 🗂️
    title: One Session History
    details: Sessions from every agent, grouped by Project. Pin, archive, fork, and import the sessions your agents already have on disk.
    link: /guide/sessions
    linkText: Projects & sessions
  - icon: 🧭
    title: Steer without waiting
    details: Inject a message into a turn that is still running, or queue one for when it ends. Answer permission prompts and forms as they arrive.
    link: /guide/working-with-agents
    linkText: Working with an agent
  - icon: 🔁
    title: Handoff between agents
    details: Ask one agent for a handoff document and continue on another, in the same directory, with the settings you choose.
    link: /guide/handoff-and-subagents
    linkText: Handoff & subagents
  - icon: 🪄
    title: Agents that spawn agents
    details: An agent can start a subagent on a different provider through the local Hub and get the result back in its own turn.
    link: /guide/handoff-and-subagents#spawned-subagents
    linkText: Spawned subagents
  - icon: 🧩
    title: Desktop and VS Code
    details: The same UI in a Tauri desktop app and in VS Code's Secondary Side Bar, sharing runtimes, Projects and settings.
    link: /guide/vscode
    linkText: VS Code extension
---

<div class="home-status">

**Pre-alpha.** There are no installers yet — HOA is built from source. [Build it in four commands →](/guide/getting-started)

</div>

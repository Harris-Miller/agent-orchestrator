# Agent providers

HOA works with these coding agents:

| Agent           | What you need                                                 | Availability |
| --------------- | ------------------------------------------------------------- | ------------ |
| **Codex**       | A Codex account. HOA downloads what it needs to run Codex.    | Available    |
| **Claude**      | A Claude account. HOA downloads what it needs to run Claude.  | Available    |
| **Cursor**      | The Cursor CLI (`cursor-agent`) installed and on your `PATH`. | Beta         |
| **Antigravity** | A personal Google account. HOA downloads Antigravity for you. | Beta         |

::: info Beta agents
Cursor and Antigravity appear only in builds with their beta flags turned on.
:::

## Install an agent

Agents aren't bundled with HOA; you download the ones you want.

1. Open **Settings › Providers**. (The Providers window also opens the first time you start HOA.)
2. Choose an agent and download it.
3. Sign in if the agent asks you to.

The desktop app and the VS Code extension share downloads — install an agent once and it works in both.

## Update or remove an agent

**Settings › Providers** lists the versions you've downloaded for each agent. From there you can download a newer version, switch which version HOA uses, or delete versions you no longer need.

## Antigravity sign-in

Antigravity signs in with a personal Google account; HOA opens the sign-in page in your browser. This sign-in is separate from any `agy` or Gemini CLI login you already have.

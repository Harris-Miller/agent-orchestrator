# Getting started

HOA has no published installers yet, so getting started means building the desktop app from source.

## Prerequisites

| Requirement                                                                                   | Why                                                                                          |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Node ≥ 22** and **npm** on your `PATH`                                                      | HOA uses them to download and run agents. It checks at startup and tells you what's missing. |
| **pnpm** (the version in `package.json`'s `packageManager`)                                   | The repository is a pnpm workspace.                                                          |
| **Rust** and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS | The desktop app is a Tauri app.                                                              |
| An account with at least one agent provider                                                   | Codex and Claude sign in through their own CLIs or keys.                                     |

## Build and run

```sh
git clone https://github.com/Harris-Miller/agent-orchestrator.git
cd agent-orchestrator
pnpm install
pnpm run tauri:dev     # run the desktop app in development
```

To produce an installable bundle instead:

```sh
pnpm run tauri:build
```

`tauri:build` also packages the [VS Code extension](./vscode) and ships it inside the desktop bundle.

## Install an agent

Agents aren't bundled with HOA; you download the ones you want.

1. Open **Settings › Providers** (the Providers modal also opens on first launch).
2. Pick an agent — **Codex** or **Claude** — and download it.
3. Sign in if the provider asks you to.

See [Agent providers](./providers) for what each provider needs.

## Start a session

1. Choose **Add Project** and pick a directory. A Project is any directory you want agents to work in.
2. Start a new session in that Project and pick the agent.
3. Type a prompt and send it.

The session appears in **Session History** under its Project as soon as it is created. Next: [Projects & Session History](./sessions).

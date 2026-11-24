# Getting started

## Install HOA

1. Make sure **Node.js 22+** and **npm** are on your `PATH`. HOA uses them to download and run agents; it checks at startup and tells you what's missing.
2. Download the installer for your OS from [GitHub Releases](https://github.com/Harris-Miller/hoa/releases):
   - **macOS** (Apple Silicon or Intel): the `.dmg`. HOA isn't notarized by Apple yet, so the first time you open it, allow it in **System Settings › Privacy & Security**.
   - **Windows:** the `-setup.exe`.
3. You need an account with at least one agent provider. Codex and Claude sign in through their own CLIs or keys.

HOA checks for updates when it starts and offers to install them.

## Build from source

To run the latest `develop` or work on HOA itself, you also need **pnpm** (the version in `package.json`'s `packageManager`) and **Rust** with the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
git clone https://github.com/Harris-Miller/hoa.git
cd hoa
pnpm install
pnpm run tauri:dev     # run the desktop app in development
```

To produce an installable bundle instead:

```sh
pnpm run tauri:build
```

`tauri:build` also packages the [VS Code extension](./vscode) and ships it inside the desktop bundle. See [Develop HOA](../contributing) for more.

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

# The HOA home (`~/.hoa`)

Everything HOA persists lives under `~/.hoa` in your OS home directory. It is shared by the desktop app and the VS Code extension.

```text
~/.hoa/
├── settings.json             # your User settings
├── projects.json             # the Projects you added
├── workstreams.json          # Workstreams (experimental)
├── logs/
│   └── hub.log               # the Hub's output (rotated to hub.log.1 at 1 MiB)
└── providers/
    └── <launch target>/      # e.g. claude-agent-acp, codex-acp
        ├── current.json      # downloaded runtimes + which one is active
        ├── runtime/<version>/
        ├── pinned-sessions.json
        └── config-option-index.json
```

HOA rewrites these files with an atomic replace, re-reads a file before applying each change, and never overwrites a file it cannot decode — fix or delete it by hand.

## Settings

`settings.json` is edited from the Settings page; you rarely need to touch it. A few keys worth knowing:

| Key                                                                           | Meaning                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `theme`                                                                       | The Harness UI theme id.                                                 |
| `midTurnSend`                                                                 | What **Send** does while a turn runs: `"steer"` or `"queue"`.            |
| `notificationsEnabled`, `notificationSoundEnabled`, `notifyOnlyWhenUnfocused` | OS notifications when an agent needs you.                                |
| `showArchived`                                                                | Include archived sessions in Session History.                            |
| `appOrchestratedAgentsEnabled`                                                | Experimental: App Orchestrated Agents (Hub, Handoff, spawned subagents). |
| `workstreamsEnabled`                                                          | Experimental: Workstreams.                                               |
| `hubPort`                                                                     | Override the Hub's fixed local port if another program uses it.          |
| `matchVscodeTheme`                                                            | VS Code only: use the editor's colors.                                   |

::: danger Pre-alpha
File formats can change between versions without a migration. When an upgrade breaks, delete the affected file (or the whole `~/.hoa`) and reinstall provider runtimes from Settings › Providers.
:::

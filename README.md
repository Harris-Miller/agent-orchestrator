# Agent Orchestrator

Current in Proof-of-Concept stage

## Running locally

### Prerequisites

* Rust: https://rust-lang.org/tools/install/
* Node@24: https://nodejs.org/en/download
* BunJS: https://bun.sh/docs/installation
* pnpm: https://pnpm.io/installation


For **Codex** and **Claude** to work, you must have their respective CLIs installed and authenticated. You also need the following ACP adapter packages installed globally (I'm working on removing this requirement):

```sh
pnpm install -g @agentclientprotocol/codex-acp
pnpm install -g @agentclientprotocol/claude-agent-acp
```

For **Gemini**, you just need to have it's CLI installed and authenticated. It already speaks ACP, so no extra npm package needed.

## Developing locally

`pnpm run local-ci` is the core quality gate, everything should pass

`pnpm run tauri:dev` launch the desktop-app as a dev-build

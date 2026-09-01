# Agent Orchestrator

Current in Proof-of-Concept stage

## Running locally

### Prerequisites

* Rust: https://rust-lang.org/tools/install/
* Node@24: https://nodejs.org/en/download
* BunJS: https://bun.sh/docs/installation
* pnpm: https://pnpm.io/installation


For `codex` and `claude` to work, you must have their respective CLI's installed and have already authenticated into them

Additionally, you need to following to packages installed globally (I'm working on removing this requirement)
```sh
pnpm install -g @agentclientprotocol/codex-acp
pnpm install -g @agentclientprotocol/claude-agent-acp
```

## Developing locally

`pnpm run local-ci` is the core quality gate, everything should pass

`pnpm run tauri:dev` launch the desktop-app as a dev-build

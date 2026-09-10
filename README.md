# Agent Orchestrator

Current in Proof-of-Concept stage

## Running locally

### Prerequisites

* Rust: https://rust-lang.org/tools/install/
* Node@24: https://nodejs.org/en/download
* BunJS: https://bun.sh/docs/installation
* pnpm: https://pnpm.io/installation

For **Codex** and **Claude**, install and authenticate their vendor CLIs (`codex`, `claude`) on your PATH. The desktop app detects those CLIs and runs the ACP adapters from a Tauri resource tree shipped with the app (no global `@agentclientprotocol/*` install).

For **Gemini**, install and authenticate the Gemini CLI. It already speaks ACP, so no adapter package is needed.

### Developing

`pnpm run local-ci` is the core quality gate, everything should pass

`pnpm run tauri:dev` launches the desktop app as a dev build (materializes ACP adapter resources, then starts Vite)

### Optional: local OTEL collector

For local telemetry (traces, metrics, logs) while debugging, run the Grafana LGTM stack from `compose.yml`:

```bash
docker compose up -d
```

This exposes OTLP on `4317` (gRPC) / `4318` (HTTP) and Grafana at http://localhost:3000. The desktop app’s `.env.development` already points `OTEL_EXPORTER_OTLP_ENDPOINT` at `http://127.0.0.1:4318`, so a `tauri:dev` session will export once the collector is up.

Stop with `docker compose down`.

# desktop

Tauri + React desktop application that hosts the **Agent Harness** — an ACP Client for driving external coding agents (Codex, Claude, Gemini) without embedding vendor LLM SDKs.

## Application

**Agent Harness**:
The desktop app's core responsibility: spawn ACP Agent subprocesses, negotiate capabilities, run sessions, and fulfill Client-side ACP requests (filesystem, terminal, permissions) on behalf of the user.
_Avoid_: Orchestrator (repo-wide product name — use in cross-package docs), client app, IDE

**Harness UI**:
The React surface that presents sessions, agent output, and permission prompts to the user. Consumes Harness domain state; does not speak ACP or spawn processes directly.
_Avoid_: Frontend, view layer, shell

## Agent backends

**Agent provider**:
A supported external coding-agent backend the Harness can connect to: **Codex**, **Claude**, or **Gemini**. Each provider is reached as an ACP Agent subprocess, not via an in-process LLM SDK.
_Avoid_: Model, LLM, vendor, integration

**ACP adapter**:
A published stdio process that wraps a vendor CLI or SDK and speaks ACP on stdin/stdout. Used for Codex ([`codex-acp`](https://github.com/agentclientprotocol/codex-acp)) and Claude ([`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)).
_Avoid_: Bridge, wrapper, proxy, shim

**Native ACP agent**:
A vendor CLI that implements ACP directly — no separate adapter package. Gemini is the initial native provider (ACP built into the Gemini CLI).
_Avoid_: Built-in agent, direct agent, first-party server

**Provider launch**:
How the Harness starts a provider subprocess: executable, arguments, working directory, and environment. Differs per provider (adapter binary vs native CLI) but always yields a stdio ACP Agent the Harness connects to via `@libs/effect-acp`.
_Avoid_: Spawn config, agent command, connection string

## Desktop host

**Tauri host**:
The desktop runtime (Rust + WebView) that runs the Harness UI and supplies OS capabilities to Effect code through Tauri plugins.
_Avoid_: Backend, native layer, shell

**Tauri services**:
Live Effect layers in `src/context-services/` that implement portable `@lib/context-services` and platform primitives (OS, Path, FileSystem, ChildProcessSpawner) on top of Tauri — analogous to `@effect/platform-node`'s `NodeServices.layer`.
_Avoid_: Platform layer, context-services (the portable package name), adapters

# jsonrpc-echo

Private test fixture — an ACP Agent with controlled I/O for `@libs/effect-acp` integration tests and manual protocol debugging. **Never published.**

## Language

**Echo agent**:
This app's Agent implementation: accepts `session/prompt`, then either replays a fixture or runs a scenario, and returns `stopReason: end_turn`.
_Avoid_: Reference agent, mock agent, production agent

**Bootstrap response**:
Spec-shaped `initialize` / `session/new` payloads returned by the echo agent so integration tests and the harness prototype can exercise full startup without a real provider.
_Avoid_: Mock response, stub

**Fixture**:
A named `fixtures/<name>.jsonl` file — one JSON object per line, each a SessionUpdate payload replayed in order on `session/prompt`. Selected by `/fixture <name>` in the prompt text; defaults to `simple-reply`.
_Avoid_: Mock, recording

**Scenario**:
A named interactive Agent procedure selected via `/fixture <name>` (e.g. `elicitation-form`, `permission-tool`) that may call Client RPCs (`elicitation/create`, `session/request_permission`) instead of only replaying JSONL.
_Avoid_: Fixture, script, demo

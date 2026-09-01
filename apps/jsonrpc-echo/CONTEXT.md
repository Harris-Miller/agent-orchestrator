# jsonrpc-echo

Private test fixture — an ACP Agent with controlled I/O for `@libs/effect-acp` integration tests and manual protocol debugging. **Never published.**

## Language

**Echo agent**:
This app's Agent implementation: accepts `session/prompt`, replays a fixture as spec-correct `session/update` notifications, then returns `stopReason: end_turn`.
_Avoid_: Reference agent, mock agent, production agent

**Fixture**:
A named `fixtures/<name>.jsonl` file — one JSON object per line, each a SessionUpdate payload replayed in order on `session/prompt`. Selected by `/fixture <name>` in the prompt text; defaults to `simple-reply`.
_Avoid_: Mock, scenario, recording

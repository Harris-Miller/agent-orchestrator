# jsonrpc-echo

Private test fixture — an ACP Agent with controlled I/O for `@libs/effect-acp` integration tests and manual protocol debugging. **Never published.**

## Language

**Echo agent**:
This app's Agent implementation: accepts `session/prompt`, replays `fixtures/*.jsonl` as spec-correct `session/update` notifications, then returns `stopReason: end_turn`. Default fixture echoes the prompt; `/fixture <name>` selects another sample.
_Avoid_: Reference agent, mock agent, production agent

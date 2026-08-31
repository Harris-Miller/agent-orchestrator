# jsonrpc-echo

Private test fixture — an ACP Agent with controlled I/O for `@libs/effect-acp` integration tests and manual protocol debugging. **Never published.**

## Language

**Echo agent**:
This app's Agent implementation: accepts `session/prompt`, emits a `session/update` with echoed content, then returns `stopReason: end_turn`.
_Avoid_: Reference agent, mock agent, production agent

# Integrate coding agents via ACP servers, not LLM SDKs

The Agent Harness must drive Codex, Claude, and Gemini from a single desktop client. We integrate each provider by spawning an ACP Agent subprocess and speaking the [Agent Client Protocol](https://agentclientprotocol.com/) over stdio — using [`codex-acp`](https://github.com/agentclientprotocol/codex-acp) and [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp) where the vendor CLI does not expose ACP natively, and the Gemini CLI where it does. We do **not** embed vendor LLM SDKs or reimplement agent loops, tool execution, or permission flows in the Harness.

This keeps one wire protocol and connection lifecycle (`@lib/effect-acp`), delegates model/auth/sandbox semantics to maintained vendor tooling, and lets new provider capabilities arrive through adapter updates rather than Harness rewrites.

# gemini-acp

ACP adapter in front of Gemini CLI: completes Client-facing session lifecycle capabilities the native Gemini ACP agent omits, while forwarding the rest to one long-lived Gemini child.

## Language

**Gemini child**:
The single native ACP agent subprocess (`gemini --acp`) owned by this adapter process for its lifetime.
_Avoid_: proxy, shim, Gemini session, vendor session

**Capability rewrite**:
Client-facing merge of Gemini's `initialize` result so `sessionCapabilities` advertises `list` / `close` / `delete` / `resume` while preserving Gemini's real prompt, mcp, loadSession, and auth surface; adapter `agentInfo` replaces Gemini's.
_Avoid_: proxy initialize, shim caps

## Package law

One Gemini child per adapter process. Client-facing session lifecycle (`list` / `close` / `delete` / `resume`) is owned by this adapter (roster I/O via `@lib/ao-home` when wired). Vendor CLI remains `gemini` on PATH.

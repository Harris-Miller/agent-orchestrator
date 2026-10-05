# gemini-acp

ACP adapter in front of Gemini CLI: completes Client-facing session lifecycle capabilities the native Gemini ACP agent omits, while forwarding the rest to one long-lived Gemini child.

## Language

**Gemini child**:
The single native ACP agent subprocess (`gemini --acp`) owned by this adapter process for its lifetime.
_Avoid_: proxy, shim, Gemini session, vendor session

**Capability rewrite**:
Client-facing merge of Gemini's `initialize` result so `sessionCapabilities` advertises `list` / `close` / `delete` / `resume` while preserving Gemini's real prompt, mcp, loadSession, and auth surface; adapter `agentInfo` replaces Gemini's.
_Avoid_: proxy initialize, shim caps

**Config rewrite**:
Client-facing synthesis of ACP `configOptions` (mode + model) from Gemini's legacy `modes` / `models` on `session/new` and `session/load`; Client `session/set_config_option` for `model` maps to unstable `session/set_model`, and for `mode` to `session/set_mode`.
_Avoid_: models passthrough, unstable model API on the Client

**Loaded set**:
Process-local set of `sessionId`s still bound on the live Gemini child. Cleared on adapter restart. Distinct from the durable adapter roster document (identity/list truth only).
_Avoid_: active sessions, open sessions, session roster

**Soft close**:
Client-facing `session/close` that drops the session from the loaded set (and best-effort cancels in-flight work), refreshes the roster row's `updatedAt` when present, without calling a Gemini close RPC or removing the adapter roster entry.
_Avoid_: hard close, kill child, deactivate (Harness UX term)

**Soft delete**:
Client-facing `session/delete` that removes the adapter roster entry and drops any loaded mark without calling a Gemini delete RPC.
_Avoid_: hard delete, purge Gemini

**Hot resume**:
Client `session/resume` when the sessionId is already in the loaded set — rebind without forwarding `session/load` to the Gemini child.
_Avoid_: warm resume, reconnect

**Cold resume**:
Client `session/resume` when the sessionId is not in the loaded set (including after adapter restart) — forward Gemini `session/load`, then mark loaded.
_Avoid_: full resume, reload

## Package law

One Gemini child per adapter process. Client-facing session lifecycle (`list` / `close` / `delete` / `resume`) is owned by this adapter (roster I/O via `@lib/ao-home`). Vendor CLI remains `gemini` on PATH.

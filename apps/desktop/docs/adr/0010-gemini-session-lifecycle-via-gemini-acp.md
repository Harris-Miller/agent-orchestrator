# Gemini session lifecycle via `gemini-acp`

The Harness needs Gemini session `list` / `close` / `delete` / hot-cold `resume`, but Gemini CLI's native ACP omits those lifecycle capabilities and upstream is not investing further. We put a middle **ACP adapter** `gemini-acp` in front of Vendor CLI `gemini --acp`: soft Client-facing `session/close` / `session/delete` (Gemini may leak until child death), advertise only `list` / `close` / `delete` / `resume`, and persist an adapter roster under AO home with a cross-process lock. Launch target is `gemini-acp` (typed `gemini-cli` removed); packaging stays ADR 0006. **ADR 0001 still holds** — ACP agents, not LLM SDKs — this ADR only clarifies that Gemini lifecycle goes through `gemini-acp` rather than mounting bare Gemini CLI. Roster/lock paths and package law live in `@lib/ao-home`; lock I/O runs in the Node adapter process (`FileSystem.open` + `wx`); if a crash leaves `roster.lock` wedged, delete it manually.

## Considered options

- **Harness-local roster synthesis:** duplicates adapter-owned durable state in the Client; wrong owner for multi-host later.
- **Wait on upstream Gemini CLI:** Google is not investing further in Gemini CLI ACP session lifecycle.
- **`@google/genai` / LLM SDK in-process:** rejected by ADR 0001 (ACP agents, not vendor LLM SDKs).
- **“effect-acp shim” name / mount bare `gemini-cli`:** obscures that this is a normal ACP adapter in the resource tree; typed `gemini-cli` goes away with the adapter mount.

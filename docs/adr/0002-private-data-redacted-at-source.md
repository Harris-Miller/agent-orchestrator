# Private data is redacted where it is logged, not scrubbed at export

**Private data** (see the desktop glossary) never reaches telemetry as plain text. A log argument that holds it is wrapped in Effect `Redacted` at the call site, so every Effect formatter, the OTLP logger included, prints `<redacted>`. An error `message` never interpolates it, and an error never keeps a cause that does, because both land on span exception events. The one exception is a message the user must read to act, which may name a file by its basename (an image the composer rejected). Identifiers (session id, launch target, pid), counts, and exit codes are not private data and stay readable for bug reports (#193).

## Considered options

- **Scrub at the OTLP export boundary:** one place to enforce, but private data is free text inside messages and stack traces, so no rule can find it reliably.
- **`Redacted` in the ACP wire schemas:** RPC spans carry only `rpc.method`, so it buys no telemetry privacy and forces `Redacted.value` through every Harness reader of prompts and updates.
- **Redact at the source (chosen):** cheap per call site and exact. The cost is discipline: a new log or error must follow the rule, and review is the guard, since tests do not assert on logs.

## Consequences

- The dev console redacts too. There is one rule, with no Build target branching.
- Known gaps: errors raised by a library or the host (Effect platform errors, the Tauri opener, VS Code) can name the path or URL they failed on in their own message, and an Agent's JSON-RPC error `message`/`data` is logged as the Agent sent it (the user already sees it in the chat).

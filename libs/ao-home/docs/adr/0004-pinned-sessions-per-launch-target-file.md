# Pinned sessions live in one file per launch target, re-read on every change

Pins are stored in `~/.ao/harness/<launchTarget>/pinned-sessions.json` as `{ pinned: [{ sessionId, cwd }] }`, beside `session-index.json`. Unlike the session index (ADR 0016, desktop: whole file rewritten from in-memory state), a pin is user-authored data that cannot be rebuilt from `session/list`, so:

- Each pin/unpin re-reads the file and applies only that change; it never rewrites from stale memory.
- A file that exists but fails to decode is never overwritten. The pin state stays "not loaded" and Pin/Unpin are disabled for that launch target.

`cwd` is stored so a cwd-scoped list (VS Code) only auto-unpins pins it could have listed. A successful, non-paginated list that omits a pin removes it; a response with `nextCursor`, a failed list, or a mismatched cwd never does.

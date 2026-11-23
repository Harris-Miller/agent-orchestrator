# The Tracked sessions store replaces the session index cache

The app records the sessions it tracks in `~/.hoa/providers/<launchTarget>/tracked-sessions.json` (`{ cwds: { <cwd>: records[] } }`, uncapped), the single source for Session History. Supersedes the index parts of [desktop ADR 0016](../../../../apps/desktop/docs/adr/0016-cache-harness-history-and-config-option-index.md) and [desktop ADR 0021](../../../../apps/desktop/docs/adr/0021-per-cwd-session-index-merge-on-write.md); `session-index.json` is no longer read or written.

- **Track what to show, not what to hide.** The index was a rebuildable cache of every `session/list` row, so anything the app created that also appeared in `session/list` (planned tickets #185, #28, a contextless cwd #400) would need a "do not show" list. A session is now tracked only when created in-app or imported by the user, and `session/list` runs only from Import.
- **Authoritative, so never rebuilt.** A record carries the row snapshot plus the app-owned `archived` flag (stored as the AIR `archived` meta). Nothing refreshes it from a list; title and Last prompt time change only from live signals. An undecodable file is never overwritten (like pins), unlike the old cache.
- **Per-record merge-on-write.** Each change re-reads the file and applies one record's upsert or removal, so desktop and VS Code can share it and neither discards the other's records. Persistence is upsert-only: dropping rows from memory (Stop tracking) leaves their records dormant in the file; only Delete removes a record.
- **No migration**, per root ADR 0001: existing cached rows must not silently become tracked, so the old file is ignored.

See also [ADR 0011](./0011-tracked-sessions-synced-by-polling.md): other instances' changes are polled and applied.

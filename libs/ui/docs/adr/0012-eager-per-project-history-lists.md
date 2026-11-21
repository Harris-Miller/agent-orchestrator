# Older history pages load eagerly, per Project

_Superseded by [ADR 0014](./0014-session-list-only-from-import.md): `session/list` runs only from Import._

Desktop Session History is listed per **Project**: one `session/list` per (launch target, Project `cwd`), each paged to exhaustion, in the background of the launch target's `usable` phase. The Backend harness reaches `ready` without waiting for them. Session History search covers every session of every loaded Project, archived or not.

- **Why eager, not on demand.** `session/list` gives no way to ask for "just the recent ones" (`updatedAt` is unknown until listed, and providers return different amounts), so the only bound is which cwds are listed, and the Project list is that bound. Paging each Project to exhaustion keeps search and the pin sweep correct (both need the whole list) and Show archived free (ADR 0008). On-demand paging stays out of scope.
- **Failure is per list.** A page error, a repeated cursor or the page cap fails only that (launch target, Project) list: rows already merged are kept, nothing is dropped, and the list is marked `incomplete` (Retry re-lists only those). It never fails the harness, so a very large history cannot block startup.
- **Cwd-scoped replace on completion.** Pages merge by `sessionId` as they arrive; only a complete list drops that cwd's cached rows it no longer lists (rows that appeared after the list began stay), and only a complete list sweeps pins, only those of that Project's cwd (#216).
- **AIR meta only where declared.** `archived: "all"` and `limit: 100` are sent only to launch targets declaring `sessionIndex` (Claude, Codex); the others get a plain ACP request.
- **VS Code unchanged in scope.** Its one Workspace cwd is simply a single list through the same path; it never adds a Project.

Amends ADR 0008 (the unbounded all-cwd list it relied on is gone) and supersedes #248's stopgap of one unscoped paged list.

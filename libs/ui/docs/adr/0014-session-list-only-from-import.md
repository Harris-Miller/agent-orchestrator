# `session/list` runs only from Import

Supersedes [ADR 0012](./0012-eager-per-project-history-lists.md): no per-Project eager listing. `session/list` is called only by Import (desktop Project `⋯` menu, VS Code Session History header), one merged list across usable launch targets with one cursor per target, paged on scroll and in the background while a search is typed (ACP has no server-side query). Amends [ADR 0008](./0008-show-archived-filters-in-app.md).

- **Why.** Session History is the Tracked sessions store (hoa-home ADR 0008), so there is nothing to keep fresh from a list: no completeness state, pin sweep, cwd-scoped replace, Reload or Retry banner. A failing target shows its own "failed — Retry" chip while the others keep paging; a repeated cursor or the page cap errors only that target.
- **ADR 0008 still holds, narrowed.** `archived: "all"` is still sent only to launch targets declaring `sessionIndex`, and Show archived filters in the app: an empty Import query obeys it, a typed query includes archived rows. The first reason (the pin sweep) is gone; the others remain.
- **Confirm is atomic.** `session/load` runs first; the record is written only after it succeeds. A failure rolls the row back and explicitly untracks it, so the persister cannot keep it.

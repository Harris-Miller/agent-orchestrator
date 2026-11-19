# Show archived filters cached Session History, not `session/list`

Every `session/list` request keeps sending the AIR filter `_meta.jetbrains.air.list.archived: "all"`. Show archived is applied in the app, as a predicate over the cached Session History, rather than being sent as the filter value. #143 originally asked for the opposite: send `"unarchived"`, `"archived"` or `"all"` from a User setting.

We filter in the app for three reasons:

- **The pin sweep depends on a complete list.** It unpins any pinned session that is missing from a full list. If the request asked for `"unarchived"`, every archived pinned session would look deleted and be unpinned without the user asking.
- **Toggling stays free.** Changing the filter on the agent would mean a new list from every Provider on each toggle, and Session History would hold rows cached under a different filter until that list finished.
- **Opening an archived row needs the row.** Activating an archived History entry first unarchives it, and the row has to already be in Session History for that to work.

## Consequences

- The agent always returns archived rows, so lists are larger. With paging (#279), there are more pages to fetch; since #386 each Project is listed and paged separately (ADR 0012), and the archived list meta is sent only to launch targets declaring `sessionIndex`.
- Changing the filter shape (for example adding "archived only") is a change to the app's predicate, not to the wire.
- Agents that ignore the AIR filter, or never mark rows archived (Gemini, Cursor, Antigravity), behave the same whether Show archived is on or off.
- The persisted index keeps at most 10 rows per cwd plus pinned ones (desktop ADR 0016), so an archived row may be absent from the cache until its Project list completes; the pin sweep still only runs on a complete list of that Project.

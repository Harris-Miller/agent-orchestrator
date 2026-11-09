# Session delete removes the whole session directory

Harness `session/delete` deletes `~/.hoa/sessions/<id>/` recursively (not only `usage.json`). Session directories are expected to hold more than usage over time; cleaning the whole tree on delete keeps orphans from accumulating. Missing paths are a no-op. Restore defaults still does not touch session directories.

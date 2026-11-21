# VS Code adds its Workspace cwd as a Project

Supersedes the "Desktop only" rule of [ADR 0007](./0007-projects-replace-tracked-cwds.md): VS Code now writes `projects.json`, but only to add its Workspace cwd, the first time a session is tracked there (a Virtual session materializes, or an Import is confirmed) and the cwd is not already a Project.

- **Why.** Tracked sessions are keyed by cwd and desktop shows only Projects. Without the add, a session created in VS Code would be invisible on desktop; with it, both hosts see the same Tracked sessions for that folder.
- **Same safety as before.** Each change re-reads the file and applies only that change; an undecodable file is never overwritten (the add is skipped and logged, tracking still succeeds).
- **VS Code still reads nothing from it.** It shows Tracked sessions for the Workspace cwd whether or not that cwd is a Project, so desktop Stop tracking does not hide them there.

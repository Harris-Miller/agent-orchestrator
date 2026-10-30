# User selects session cwd on create

`session/new` previously used the host process cwd (or `.` for the echo fixture). The Harness now requires the user to pick an absolute directory when creating a session and passes that as the ACP working directory. History entries carry that session cwd; the Session History UI groups by it.

ACP treats `cwd` as part of the session's filesystem identity — it must remain the primary working directory on later `session/load` / `session/resume`. User selection lets one agent connection own sessions across multiple projects instead of forcing every session into the Tauri host cwd.

## Considered options

- **Always host cwd (previous behavior):** simpler create dialog, but every session shares one project root and fights multi-cwd Session History grouping.
- **Default to last-used session cwd:** nicer create UX later; orthogonal to making cwd an explicit create input.

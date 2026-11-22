# Projects & Session History

## Projects

A **Project** is an absolute directory you bring into HOA. Add one with **Add Project** or from the composer's **Choose Project**. Projects are shared by every agent and by both the desktop app and VS Code.

Remove a Project with **Stop tracking**. Its sessions stay on disk with the agent; HOA just stops listing them.

## Session History

**Session History** lists the sessions HOA owns a record of, grouped by Project:

- groups are ordered alphabetically by directory name,
- inside a group, unarchived sessions come before archived ones, newest prompt first,
- every row shows which agent it runs on.

A session appears here when you create it in HOA (or a fork or Handoff creates it), or when you **Import** it.

### Import

Agents keep their own session stores. **Import** asks an agent which sessions it has for a Project's directory and lets you choose which ones HOA should track — so a session you started in a terminal can be continued in HOA. An archived session imports as archived.

### Pin, archive, delete

| Action      | Effect                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Pin**     | Shows the session once, in the Pinned section at the top, instead of in its Project group.                                           |
| **Archive** | Hides the session unless **Show archived** is on, and archives it with the agent too when the agent supports that. It stays tracked. |
| **Delete**  | The only way to remove a session completely. Asks for confirmation unless you turned that off in Settings.                           |

Enter **bulk select** from the Session History header to check several rows — across Projects — and archive, unarchive or delete them together.

## A session's folder

Every session works in one folder, chosen when you create it; it can't change afterwards. A Handoff or subagent always starts in the same folder as the session it came from.

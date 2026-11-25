# Projects replace Tracked cwds

_Partly superseded by [ADR 0009](./0009-vscode-adds-its-workspace-cwd-as-a-project.md): VS Code also writes the file. Amended: a Project path may also be a `.code-workspace` file (a Workspace project), see desktop ADR 0022._

Supersedes [ADR 0006](./0006-tracked-cwds-in-one-root-file.md). The user's chosen directories are **Projects**, stored in `~/.hoa/projects.json` as `{ projects: string[] }` (provisional shape). `tracked-cwds.json` is no longer read or written.

- **Explicit, not inferred.** Tracked cwds grew from every visible Session History row, including the disposable Config probe directories, so which cwds appeared was accidental and Session History was unbounded. A Project exists only because the user added it (Project Selection Modal or the Composer), and the Project list bounds the `session/list` work.
- **Same file placement as ADR 0006.** One root file shared by all launch targets, not per launch target and not in `settings.json`; each change re-reads the file and applies only that change; an undecodable file is never overwritten.
- **Desktop reads and writes it.** _(VS Code later also adds its Workspace cwd: see [ADR 0009](./0009-vscode-adds-its-workspace-cwd-as-a-project.md).)_
- **Paths compare exact** after trailing-separator normalization (no symlink or case folding).

No migration, per root ADR 0001: consumers delete `tracked-cwds.json` and re-add their Projects.

**Amendment (Workspace projects).** The list is still `string[]`: a path ending `.code-workspace` is a Workspace project, resolved to its first `file:` folder (the Session cwd) plus Additional directories when read (desktop ADR 0022). Desktop reads workspace files through the home-scoped filesystem, so a file outside the home directory cannot be added in v1, and one already listed shows as an unresolvable Workspace project.

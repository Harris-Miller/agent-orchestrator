# Projects replace Tracked cwds

Supersedes [ADR 0006](./0006-tracked-cwds-in-one-root-file.md). The user's chosen directories are **Projects**, stored in `~/.hoa/projects.json` as `{ projects: string[] }` (provisional shape). `tracked-cwds.json` is no longer read or written.

- **Explicit, not inferred.** Tracked cwds grew from every visible Session History row, including the disposable Config probe directories, so which cwds appeared was accidental and Session History was unbounded. A Project exists only because the user added it (Project Selection Modal or the Composer), and the Project list bounds the `session/list` work.
- **Same file placement as ADR 0006.** One root file shared by all launch targets, not per launch target and not in `settings.json`; each change re-reads the file and applies only that change; an undecodable file is never overwritten.
- **Desktop only.** The desktop app is the only reader and writer; VS Code never adds Projects.
- **Paths compare exact** after trailing-separator normalization (no symlink or case folding).

No migration, per root ADR 0001: consumers delete `tracked-cwds.json` and re-add their Projects.

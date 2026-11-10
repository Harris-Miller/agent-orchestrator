# Tracked cwds live in one file at the HOA home root

Tracked cwds are stored in `~/.hoa/tracked-cwds.json` as `{ cwds: string[] }`, not per launch target like pins (ADR 0004) and not in `settings.json`.

- **Not per launch target.** Desktop Session History groups rows by cwd across launch targets, so a cwd is one project folder whichever agent used it. Per-target files would need a union on read and a multi-file rewrite on Untrack. ADR 0005's `providers/<launchTarget>/` holds per-target data; this is not.
- **Not User settings.** Restore defaults rewrites `settings.json` only (ADR 0002); a list the user built by working must survive it.
- Same safety as pins: each change re-reads the file and applies only that change, and an undecodable file is never overwritten (tracking is then off for the session).

No migration, per root ADR 0001: existing cwds are tracked from Session History on first run.

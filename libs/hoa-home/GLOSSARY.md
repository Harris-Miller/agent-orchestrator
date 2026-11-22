# hoa-home

Product filesystem home for Harness Orchestrating Agents (`~/.hoa`): the only package that reads or writes under that tree.

## Language

**HOA home**:
The product directory `~/.hoa` under the OS user home — a scaling root for durable prefs and session artifacts, not the OS home itself.
_Avoid_: home directory, OS home, `$HOME` (when meaning this product dir)

**User settings**:
The user-mutable preferences file `settings.json` inside the HOA home.
_Avoid_: Settings document, config, configuration, session configuration, config option

**Always-hidden glob**:
A User settings `fd` exclude pattern (`alwaysHiddenGlobs`) always applied on Harness `fd` listings (New Session shallow picker and composer `@` recursive listing), in addition to the hardcoded `.git` exclude. Beats Show hidden — matching paths stay excluded when Show hidden is on. Not removable via Settings for `.git` itself.
_Avoid_: ignore glob, hide pattern, gitignore entry (when you mean this User settings field)

**Tracked sessions document**:
The app's own durable record of which sessions it tracks per launch target, grouped by session cwd. Each record holds the session's row snapshot plus the app-owned `archived` flag. Shared by desktop and VS Code. Records of a Project that stopped being tracked are kept until the Project is added again. See ADR 0008.
_Avoid_: session index, session cache, live session list

**Pinned sessions document**:
Per-launch-target `providers/<launchTarget>/pinned-sessions.json` listing pinned `{ sessionId, cwd }`. Each change re-reads the file and applies only that change; an undecodable file is never overwritten (see ADR 0004).
_Avoid_: Pin list, favorites

**Projects document**:
`projects.json` at the HOA home root listing the Projects (desktop glossary) as `{ projects: string[] }` (provisional shape). One file for all launch targets, since cwd groups are unified across them (see ADR 0007). Paths are normalized for trailing separators. Each change re-reads the file and applies only that change; an undecodable file is never overwritten. Desktop reads and writes it; VS Code only adds its Workspace cwd (see ADR 0009).
_Avoid_: tracked cwds, cwd history

**Config option index cache**:
Durable per-launch-target copy of the Config option index under `providers/<launchTarget>/config-option-index.json`, used to show choices while a Harness probes its agent.
_Avoid_: Provider catalog, session configuration

**Provider directory**:
`providers/<launch target>/` inside the HOA home — the single per-launch-target directory. Holds `runtime/<version>/` directories, the `current.json` Provider runtime document, and the Harness-owned files for that launch target (Application session index, Pinned sessions document, Config option index cache).
_Avoid_: adapter dir, harness dir

**Provider runtime document**:
`providers/<id>/current.json`: schema version, an **Active runtime** reference (version + provider-relative directory, or null) and a catalog of **Downloaded runtimes** with a discriminated download state (`downloading`, `completed`, `failed`, `pending-delete`) and the resolved npm/binary distribution. The active reference must point at a completed entry. Missing is distinct from malformed/unreadable (an error, never an instruction to seed or delete). Published through the Host's atomic replace.
_Avoid_: symlink, current pointer, install manifest

**Active runtime**:
The completed runtime `current.json` selects for launch. Re-read before every spawn; no file watching.

**Downloaded runtime**:
A completed catalog entry that is not active — an update waiting to be Installed. Superseded ones are deleted on Install; a failed deletion stays cataloged (`pending-delete`) and is retried at startup.

**Antigravity ACP home**:
Credential / profile directory `providers/antigravity-acp/home/` — value of `GEMINI_HOME` for managed Antigravity ACP. Distinct from the runtime binary tree. Credentials here are **not** shared with PATH `agy` / Gemini CLI logins.
_Avoid_: runtime dir, Gemini CLI home, `agy` login store

**Antigravity BROWSER helper**:
Capture-only script at `providers/antigravity-acp/browser-helper` — written and chmod'd here; set as controlled `BROWSER` for managed Antigravity ACP; prints an auth URL marker to stderr; does not open a browser (Host OpenUrl does).
_Avoid_: system browser, Host OpenUrl (when you mean the helper path)

## Package law

Every filesystem read or write under the HOA home goes through `@lib/hoa-home`. Apps must not perform ad-hoc `FileSystem` I/O against that tree.

**Workstreams document**:
`workstreams.json` at the HOA home root listing the Workstreams (desktop glossary) as `{ workstreams: [...] }` (provisional shape), each with its name, Tracker refs, archived flag and the sessions it owns as `{ launchTarget, sessionId }`. One file for all launch targets, since a Workstream spans them (see ADR 0010). Each change re-reads the file and applies only that change; an undecodable file is never overwritten.
_Avoid_: features file, groups file

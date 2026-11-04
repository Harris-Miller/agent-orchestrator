# ao-home

Product filesystem home for Agent Orchestrator (`~/.ao`): the only package that reads or writes under that tree.

## Language

**Agent Orchestrator home**:
The product directory `~/.ao` under the OS user home — a scaling root for durable prefs and session artifacts, not the OS home itself.
_Avoid_: home directory, OS home, `$HOME` (when meaning this product dir)

**User settings**:
The user-mutable preferences file `settings.json` inside the Agent Orchestrator home.
_Avoid_: Settings document, config, configuration, session configuration, config option

**Always-hidden glob**:
A User settings `fd` exclude pattern (`alwaysHiddenGlobs`) always applied on Harness `fd` listings (New Session shallow picker and composer `@` recursive listing), in addition to the hardcoded `.git` exclude. Beats Show hidden — matching paths stay excluded when Show hidden is on. Not removable via Settings for `.git` itself.
_Avoid_: ignore glob, hide pattern, gitignore entry (when you mean this User settings field)

**Adapter history document**:
Per agent launch target durable session list under `adapters/<launchTarget>/history.json` inside the Agent Orchestrator home — the adapter-owned source for `session/list` when the vendor ACP agent cannot list sessions. Not the Harness Session History.
_Avoid_: Adapter roster document, Session History (Harness term), user settings, session snapshot

**Application session index**:
Harness-owned durable view of listed sessions under `harness/<launchTarget>/session-index.json`. Hydrated as unavailable rows before agent startup; distinct from the Adapter history document, which belongs to an ACP adapter.
_Avoid_: Adapter history document, live session list

**Pinned sessions document**:
Per-launch-target `harness/<launchTarget>/pinned-sessions.json` listing pinned `{ sessionId, cwd }`. Each change re-reads the file and applies only that change; an undecodable file is never overwritten (see ADR 0004).
_Avoid_: Pin list, favorites

**Config option index cache**:
Durable per-launch-target copy of the Config option index under `harness/<launchTarget>/config-option-index.json`, used to show choices while a Harness probes its agent.
_Avoid_: Provider catalog, session configuration

**Adapter history lock**:
Cross-process lockfile at `adapters/<launchTarget>/history.lock` (next to `history.json`) guarding read-modify-write of an Adapter history document so multiple adapter processes do not corrupt shared durable state. Acquire needs a `FileSystem` that supports `open` with `"wx"` (Node adapter process; not the host webview FS). If a crash leaves the lock wedged, delete `history.lock` manually.
_Avoid_: Adapter roster lock, file lock (generic), mutex

**Session usage document**:
System-created context-window fill and cost under `sessions/<id>/usage.json` inside the Agent Orchestrator home. Not user-editable User settings; missing or corrupt file means no usage yet.
_Avoid_: user settings, usage readout, telemetry

**Session directory**:
Per-session folder `sessions/<id>/` inside the Agent Orchestrator home. Removed wholesale on Harness `session/delete`. Abandoned dirs (never deleted via Harness) remain until that explicit delete — no GC in this package.
_Avoid_: session snapshot, Session History, Adapter history document

**Provider directory**:
`providers/<launch target>/` inside the Agent Orchestrator home. Holds `runtime/<version>/` directories and the `current.json` Provider runtime document.
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
_Avoid_: runtime dir, Adapter history document, Gemini CLI home, `agy` login store

**Antigravity BROWSER helper**:
Capture-only script at `providers/antigravity-acp/browser-helper` — written and chmod'd here; set as controlled `BROWSER` for managed Antigravity ACP; prints an auth URL marker to stderr; does not open a browser (Host OpenUrl does).
_Avoid_: system browser, Host OpenUrl (when you mean the helper path)

## Package law

Every filesystem read or write under the Agent Orchestrator home goes through `@lib/ao-home`. Apps must not perform ad-hoc `FileSystem` I/O against that tree.

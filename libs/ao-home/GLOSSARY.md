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

**Adapter roster document**:
Per agent launch target durable session list under `adapters/<launchTarget>/roster.json` inside the Agent Orchestrator home — the adapter-owned source for `session/list` when the vendor ACP agent cannot list sessions. Not the Harness in-memory session roster cache.
_Avoid_: session roster (Harness term), user settings, session snapshot

**Application session index**:
Harness-owned durable view of listed sessions under `harness/<launchTarget>/session-index.json`. Hydrated as unavailable rows before agent startup; distinct from the Adapter roster document, which belongs to an ACP adapter.
_Avoid_: Adapter roster document, live session list

**Config option index cache**:
Durable per-launch-target copy of the Config option index under `harness/<launchTarget>/config-option-index.json`, used to show choices while a Harness probes its agent.
_Avoid_: Provider catalog, session configuration

**Adapter roster lock**:
Cross-process lockfile at `adapters/<launchTarget>/roster.lock` (next to `roster.json`) guarding read-modify-write of an adapter roster document so multiple adapter processes do not corrupt shared durable state. Acquire needs a `FileSystem` that supports `open` with `"wx"` (Node adapter process; not the host webview FS). If a crash leaves the lock wedged, delete `roster.lock` manually.
_Avoid_: file lock (generic), mutex

**Session usage document**:
System-created context-window fill and cost under `sessions/<id>/usage.json` inside the Agent Orchestrator home. Not user-editable User settings; missing or corrupt file means no usage yet.
_Avoid_: user settings, usage readout, telemetry

**Session directory**:
Per-session folder `sessions/<id>/` inside the Agent Orchestrator home. Removed wholesale on Harness `session/delete`. Abandoned dirs (never deleted via Harness) remain until that explicit delete — no GC in this package.
_Avoid_: session snapshot, session roster, adapter roster document

**Antigravity ACP home**:
Credential / profile directory `antigravity-acp/home/` inside the Agent Orchestrator home — value of `GEMINI_HOME` for managed Antigravity ACP. Distinct from the runtime binary tree. Credentials here are **not** shared with PATH `agy` / Gemini CLI logins.
_Avoid_: runtime dir, adapter roster, Gemini CLI home, `agy` login store

**Antigravity ACP runtime**:
Pinned managed binaries under `antigravity-acp/runtime/<version>/` inside the Agent Orchestrator home (`agy_acp_server.par` + `localharness_external`). Materialize + chmod in this package; download/verify/extract lives in `@lib/ui` host (staging outside AO home).
_Avoid_: adapter resource tree, Vendor CLI, PATH install

**Antigravity BROWSER helper**:
Capture-only script at `antigravity-acp/browser-helper` under the Agent Orchestrator home — written and chmod'd here; set as controlled `BROWSER` for managed Antigravity ACP; prints an auth URL marker to stderr; does not open a browser (Host OpenUrl does).
_Avoid_: system browser, Host OpenUrl (when you mean the helper path)

## Package law

Every filesystem read or write under the Agent Orchestrator home goes through `@lib/ao-home`. Apps must not perform ad-hoc `FileSystem` I/O against that tree.

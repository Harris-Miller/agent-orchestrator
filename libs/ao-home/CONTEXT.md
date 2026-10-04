# ao-home

Product filesystem home for Agent Orchestrator (`~/.ao`): the only package that reads or writes under that tree.

## Language

**Agent Orchestrator home**:
The product directory `~/.ao` under the OS user home — a scaling root for durable prefs and session artifacts, not the OS home itself.
_Avoid_: home directory, OS home, `$HOME` (when meaning this product dir)

**User settings**:
The user-mutable preferences file `settings.json` inside the Agent Orchestrator home.
_Avoid_: Settings document, config, configuration, session configuration, config option

**Adapter roster document**:
Per agent launch target durable session list under `adapters/<launchTarget>/roster.json` inside the Agent Orchestrator home — the adapter-owned source for `session/list` when the vendor ACP agent cannot list sessions. Not the Harness in-memory session roster cache.
_Avoid_: session roster (Harness term), user settings, session snapshot

**Adapter roster lock**:
Cross-process lockfile at `adapters/<launchTarget>/roster.lock` (next to `roster.json`) guarding read-modify-write of an adapter roster document so multiple adapter processes do not corrupt shared durable state. Acquire needs a `FileSystem` that supports `open` with `"wx"` (Node adapter process; not the host webview FS). If a crash leaves the lock wedged, delete `roster.lock` manually.
_Avoid_: file lock (generic), mutex

**Session usage document**:
System-created context-window fill and cost under `sessions/<id>/usage.json` inside the Agent Orchestrator home. Not user-editable User settings; missing or corrupt file means no usage yet.
_Avoid_: user settings, usage readout, telemetry

**Session directory**:
Per-session folder `sessions/<id>/` inside the Agent Orchestrator home. Removed wholesale on Harness `session/delete`. Abandoned dirs (never deleted via Harness) remain until that explicit delete — no GC in this package.
_Avoid_: session snapshot, session roster, adapter roster document

## Package law

Every filesystem read or write under the Agent Orchestrator home goes through `@lib/ao-home`. Apps must not perform ad-hoc `FileSystem` I/O against that tree.

# ao-home

Product filesystem home for Agent Orchestrator (`~/.ao`): the only package that reads or writes under that tree.

## Language

**Agent Orchestrator home**:
The product directory `~/.ao` under the OS user home — a scaling root for durable prefs and session artifacts, not the OS home itself.
_Avoid_: home directory, OS home, `$HOME` (when meaning this product dir)

**Settings document**:
The user-mutable preferences file `settings.json` inside the Agent Orchestrator home.
_Avoid_: config, configuration, session configuration, config option

## Package law

Every filesystem read or write under the Agent Orchestrator home goes through `@lib/ao-home`. Apps must not perform ad-hoc `FileSystem` I/O against that tree.

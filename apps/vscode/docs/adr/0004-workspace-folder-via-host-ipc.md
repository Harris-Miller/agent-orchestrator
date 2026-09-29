# Workspace folder paths via Host IPC, not OS snapshot cwd

The sidebar Session cwd comes from VS Code Workspace folder absolute paths. Those are delivered over Host IPC as their own capability. OS snapshot `cwd` stays the extension-host process cwd and must not be overloaded with workspace roots — the two concepts are different, and conflating them would break anything that needs real process cwd while also hiding IDE multi-root semantics.

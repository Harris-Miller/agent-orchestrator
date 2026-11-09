# Rename to Harness Orchestrating Agents (HOA); `~/.ao` becomes `~/.hoa` with no migration

The product is renamed from the placeholder "Agent Orchestrator" to **Harness Orchestrating Agents**, short form **HOA**. The product home moves from `~/.ao` to `~/.hoa`, and the `ao-home` package and context become `hoa-home`.

There is no migration: nothing reads, copies, or warns about `~/.ao`. The product is pre-alpha with a single user, who removes `~/.ao` by hand. Provider runtimes are reinstalled from Settings > Providers, and settings, session history, and pins start fresh.

The shell-scope validator in the Tauri capabilities, the Rust path checks, and the keep-awake `--who` label must match the TypeScript constants exactly; a mismatch fails at runtime, not at compile time.

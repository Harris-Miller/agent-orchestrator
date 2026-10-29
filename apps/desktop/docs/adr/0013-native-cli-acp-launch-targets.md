# Native Vendor CLI ACP launch targets (no adapter resource entry)

Some Agent providers already speak ACP on a Vendor CLI (`cursor-agent acp`). For those, the Harness spawns the CLI directly — no Node shim, no `acp-adapter-resources` entry, and `AgentLaunchTarget` is an owned union rather than `keyof acpAdapterEntryPaths.json`. ADR 0006 still covers Node ACP adapters shipped as Tauri resources.

Cursor-only lifecycle this issue: always `session/load` on activate (temporary until a follow-up proves `session/resume`); best-effort `session/close` on deactivate and delete (`Effect.exit`, then still mark inactive / delete + local drop). Codex/Claude keep ADR 0004’s `hasHistory` heuristic and fail-closed close.

## Considered options

- **Bundled Node adapter / third-party npm package:** unnecessary when the Vendor CLI already speaks ACP; adds packaging and version skew.
- **`AgentLaunchTarget` = JSON keys only:** blocks native-CLI targets that must not appear in the adapter resource tree.
- **Always `session/resume` for Cursor / capability helpers for all providers:** deferred until resume is proven and a global gate is designed.

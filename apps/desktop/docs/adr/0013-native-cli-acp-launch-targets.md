# Native Vendor CLI ACP launch targets (no adapter resource entry)

> **Amended (Agent capabilities).** The global gate deferred below now exists: the Harness reads Agent capabilities once at initialize. Cursor's always-`session/load` stays as a Provider quirk inside them (Cursor never resumes until a follow-up proves `session/resume`). The Cursor/Antigravity best-effort close is no longer a launch-target check: `session/close` fails Deactivate and delete only when the Agent advertises `sessionCapabilities.close`, and is best-effort for any Agent that does not (Deactivate and delete are never refused). Fork, Archive and Rename are refused by the Harness itself when the Agent capabilities lack them, matching what the UI hides.

Some Agent providers already speak ACP on a Vendor CLI (`cursor-agent acp`). For those, the Harness spawns the CLI directly — no Node shim, no `acp-adapter-resources` entry, and `AgentLaunchTarget` is an owned union rather than `keyof acpAdapterEntryPaths.json`. ADR 0006 still covers Node ACP adapters shipped as Tauri resources.

Cursor-only lifecycle this issue: always `session/load` on activate (temporary until a follow-up proves `session/resume`); best-effort `session/close` on deactivate and delete (`Effect.exit`, then still mark inactive / delete + local drop). Codex/Claude keep ADR 0004’s `hasHistory` heuristic and fail-closed close.

## Considered options

- **Bundled Node adapter / third-party npm package:** unnecessary when the Vendor CLI already speaks ACP; adds packaging and version skew.
- **`AgentLaunchTarget` = JSON keys only:** blocks native-CLI targets that must not appear in the adapter resource tree.
- **Always `session/resume` for Cursor / capability helpers for all providers:** deferred until resume is proven and a global gate is designed.

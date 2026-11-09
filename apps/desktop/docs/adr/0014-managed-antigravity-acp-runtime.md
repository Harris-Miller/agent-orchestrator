# Managed Antigravity ACP runtime (native launch)

> **Amended by [ADR 0017](0017-user-installed-provider-runtimes.md).** The pin, `~/.hoa/antigravity-acp/` layout, lazy download at launch and fixed shell-scope path described below are historical: the runtime is now user-downloaded under `~/.hoa/providers/antigravity-acp/` from the ACP registry, selected by `current.json`, and spawned through a constrained native boundary.

The Harness mounts Google Antigravity as launch target `antigravity-acp` by downloading a pinned `agy_acp_server` release (1.4.1, darwin/linux) into `~/.hoa/antigravity-acp/runtime/<version>/` and spawning it by Tauri shell allowlist name `agy_acp_server` — no Node ACP adapter, no Vendor CLI on PATH. Credential tree is `GEMINI_HOME=~/.hoa/antigravity-acp/home`. Activate prefers `session/resume` when local transcript has history (ADR 0004 heuristic); deactivate/delete use best-effort `session/close` like Cursor (agent advertises list/resume, not close/delete). In-app Sign in (`oauth-personal`, BROWSER helper, Host OpenUrl) is [ADR 0015](0015-antigravity-oauth-personal-sign-in.md); unsigned bootstrap still surfaces “Antigravity is not signed in.” until the user Signs in. Windows pin deferred. **Supersedes ADR 0010** (`gemini-acp` adapter); historical Gemini sessions under `~/.hoa/adapters/gemini-acp/` are left on disk but no longer listed. Peer to [ADR 0013](0013-native-cli-acp-launch-targets.md) (native spawn without adapter resources).

## Considered options

- **Keep `gemini-acp` adapter in front of Gemini CLI:** Google’s first-party ACP path is Antigravity; Gemini CLI ACP lifecycle investment stopped (ADR 0010 premise).
- **PATH-installed `agy` / registry agent only:** `agy` is TUI; Antigravity ACP is the managed `agy_acp_server` zip, not a PATH CLI install like Cursor.
- **Ship binary as Tauri sidecar:** pin updates would force app rebuilds; lazy download under HOA home matches peer products and keeps capability `cmd` on a fixed `$HOME/.hoa/.../1.4.1/...` path.

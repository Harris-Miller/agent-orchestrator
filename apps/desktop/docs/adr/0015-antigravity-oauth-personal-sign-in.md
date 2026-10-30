# Antigravity Sign in via user-gated `oauth-personal`

Managed Antigravity ACP needs Google account credentials under Antigravity ACP home before Config probe can succeed. In-app **Sign in** is user-gated: the Harness respawns with a capture-only `BROWSER` helper (stderr marker), runs ACP `authenticate` with `oauth-personal`, surfaces the auth URL (Host **OpenUrl** + copyable UI), waits on the same process (~5 minute timeout), then continues probe → `ready`. Ambient Google/`BROWSER` env stays scrubbed; API-key / Vertex / logout are deferred. Chosen over eager authenticate (surprise browser) and over restart-only after browser (peers complete on the live `authenticate` RPC).

## Considered options

- **Eager `authenticate` after every `initialize`:** opens browser on cold start even when already signed in; rejected.
- **Restart-after-browser only:** simpler, but drops the in-flight `authenticate` wait peers rely on; kept only as timeout/Restart fallback.
- **API key / Vertex Settings in the same change:** out of scope for unblocking browser OAuth.

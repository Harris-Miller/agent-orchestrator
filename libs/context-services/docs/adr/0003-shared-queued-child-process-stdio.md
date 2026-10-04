# Shared queued ChildProcess stdio in context-services

ChildProcessSpawner Live Adapters (Tauri shell, VS Code webview IPC) share Effect-only stdio queue + `ChildProcessHandle` assembly via `openQueuedChildProcessStdio` in `@lib/context-services`. Adapters open stdio before spawn so transport listeners can bind early, then `finalize` with pid / kill / stdin. We rejected keeping full queue/handle copies in each Live (queue-end bugs drift) and rejected a new package (two adapters, Effect-only code belongs next to the Host services tags). Host SDKs and spawn transport stay in the Live packages.

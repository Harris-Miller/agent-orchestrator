# acp-adapter-resources

Isolated install of ACP adapter packages (`claude-agent-acp`, `codex-acp`) used as external Agent subprocesses by desktop (Tauri resources) and the VS Code extension (packaged tree).

Root `install-acp-adapter-deps` runs `pnpm install --prod` here. Antigravity is a managed binary under `~/.ao/antigravity-acp/` (not an adapter resource).

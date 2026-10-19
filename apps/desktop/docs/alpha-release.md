# Desktop Alpha release

Builds installers via GitHub Actions and publishes a draft GitHub Release. Installed apps check `https://github.com/Harris-Miller/agent-orchestrator/releases/latest/download/latest.json` on launch (production builds only).

Branching: see [`docs/gitflow.md`](../../../docs/gitflow.md). Release packaging runs on **push to `main`** (merge a release PR), or via **Actions → Release desktop → Run workflow**.

## One-time secrets

Signing keys were generated with:

```bash
pnpm --filter @apps/desktop tauri signer generate --ci -w ~/.tauri/agent-orchestrator.key -f
```

Public key is already in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret                               | Value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of `~/.tauri/agent-orchestrator.key` (or `cat` that file) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Empty string if the key was generated with `--ci` / no password    |

If you regenerate keys, replace `pubkey` in `tauri.conf.json` and update the private-key secret. Losing the private key breaks updates for existing installs.

## Ship a build

1. On `develop` (or a `release/*` branch), bump `version` in `apps/desktop/src-tauri/tauri.conf.json` (and `apps/desktop/package.json` if you keep them aligned).
2. Open a PR into `main`, merge when green (or run **Actions → Release desktop → Run workflow** on the commit you want).
3. Open the draft GitHub Release, confirm assets include platform installers plus `latest.json`, then publish it as a normal release (not “pre-release”). GitHub’s `/releases/latest` — used by the updater — ignores pre-releases.
4. If needed, merge `main` back into `develop` so version bumps stay on the integration branch.

## Local signed build (optional)

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/agent-orchestrator.key"
# or: export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/agent-orchestrator.key)"
pnpm --filter @apps/desktop tauri:build
```

## Notes

- macOS Gatekeeper: Alpha can ship unsigned/ad-hoc; for smoother installs later, add Apple signing/notarization secrets.
- VS Code `.vsix` is separate (`pnpm --filter agent-orchestrator-vscode run package`) and does not auto-update from GitHub.

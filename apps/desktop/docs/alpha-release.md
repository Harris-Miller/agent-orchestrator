# Desktop Alpha release

Builds installers and a VS Code `.vsix` via GitHub Actions and publishes a **draft** GitHub Release tagged `vX.Y.Z`. Installed apps check `https://github.com/Harris-Miller/agent-orchestrator/releases/latest/download/latest.json` on launch (production builds only).

Branching: see [`docs/gitflow.md`](../../../docs/gitflow.md). Release packaging runs on **push to `main`** (merge a release PR), or via **Actions → Release → Run workflow**.

Product version lives in the **repo root** `package.json`. Bump with `pnpm version:app` (syncs `tauri.conf.json`, `Cargo.toml`, and `apps/vscode/package.json`). Tags are created by CI on `main`, not by the bump script. Workflows do not run on tag pushes.

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

1. From `develop`, create `release/x.y.z` and run `pnpm version:app <patch|minor|major|…>`.
2. Open a PR into `main`, merge when green (or run **Actions → Release → Run workflow** on the commit you want). Re-runs fail if tag `vX.Y.Z` already exists — bump or delete the tag/release by hand first.
3. Open the draft GitHub Release (`Agent Orchestrator vX.Y.Z`), confirm assets include platform installers, `latest.json`, and the `.vsix`, edit notes if you want a short changelog, then publish it as a **normal** release (not “pre-release”). GitHub’s `/releases/latest` — used by the updater — ignores pre-releases and drafts.
4. CI attempts to fast-forward `develop` to `main` after assets upload. If that fails, align the branches manually.

## Local signed build (optional)

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/agent-orchestrator.key"
# or: export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/agent-orchestrator.key)"
pnpm --filter @apps/desktop tauri:build
```

Local VS Code package (same version as root after a bump):

```bash
pnpm --filter hoa-vscode run package
```

## Notes

- macOS Gatekeeper: Alpha can ship unsigned/ad-hoc; for smoother installs later, add Apple signing/notarization secrets.
- The `.vsix` is attached to the same GitHub Release as the desktop installers; it does not auto-update from GitHub.

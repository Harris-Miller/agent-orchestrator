# Desktop Alpha release

Release CI (`.github/workflows/release-desktop.yml`) builds macOS (Apple Silicon + Intel) and Windows installers and the VS Code `.vsix`, and attaches them to a **draft** GitHub Release tagged `vX.Y.Z`. Installed apps check `https://github.com/Harris-Miller/agent-orchestrator/releases/latest/download/latest.json` on launch (production builds only).

Branching: see [`docs/gitflow.md`](../../../docs/gitflow.md). Release CI runs on **push to `main`** (merging a release PR), or via **Actions → Release → Run workflow** on `main`.

## Versioning

- **Git tags are the source of truth.** The last version is the latest `vX.Y.Z` tag; nothing commits a version back.
- `apps/desktop/package.json` and `apps/vscode/package.json` hold `"version": "0.0.0"` (dev builds show `0.0.0`). `tauri.conf.json` reads its version from `../package.json`. The root `package.json`, `libs/` and `tooling/` have no version.
- On push to `main`, `scripts/release-version.mjs` runs semantic-release as a dry run (`release.config.mjs`, ESLint preset). It reads the squash-merged PR titles since the last tag and picks the highest bump. No releasable commit (`New`, `Update`, `Fix`, `Breaking`) → no release, and the later jobs are skipped.
- CI writes the computed version into both apps' `package.json` before it builds. The change is never committed.
- **Version policy:** Alpha releases are PATCH only (`0.1.x`); the first release is `0.1.0`. Beta releases are MINOR or PATCH, and `1.0.0` ends Beta. The maintainer changes `releaseRules` in `release.config.mjs` by hand at each stage change.
- Don't create a `v*` tag by hand: semantic-release treats it as already shipped, so that version would never be built.

## Release notes

semantic-release builds the notes from the same commits that decided the version, grouped by tag. Each squash commit title ends in `(#123)`, which becomes a link to the PR. CI passes the notes to `gh release create --notes-file`.

## One-time setup

Signing keys were generated with:

```bash
pnpm --filter @apps/desktop tauri signer generate --ci -w ~/.tauri/agent-orchestrator.key -f
```

The public key is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret                               | Value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of `~/.tauri/agent-orchestrator.key` (or `cat` that file) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Empty string if the key was generated with `--ci` / no password    |

If you regenerate keys, replace `pubkey` in `tauri.conf.json` and update the private-key secret. Losing the private key breaks updates for existing installs.

## Ship a build

1. Merge a release PR from `develop` into `main` (merge commit). Its title still has to pass the title check, e.g. `Chore: Release`; it doesn't affect the version.
2. Release CI computes the version, fails if a tag **or** a release (draft included) with that name already exists, then builds every platform into a draft release and checks that `latest.json` lists `darwin-aarch64`, `darwin-x86_64` and `windows-x86_64`.
3. Open the draft (`HOA vX.Y.Z`), confirm the assets (installers, `.app.tar.gz` + `.sig`, `-setup.exe` + `.sig`, `latest.json`, `.vsix`), edit the notes if you want, then publish it as a **normal** release (not a pre-release). GitHub's `/releases/latest`, which the updater reads, ignores drafts and pre-releases. Publishing creates the `vX.Y.Z` tag.

A draft has no git tag, so until it is published (or deleted) every re-run computes the same version and stops at the "already exists" check.

## Bundles

`tauri.conf.json` sets `"targets": ["app", "dmg", "nsis"]`; the bundler drops targets that don't match the build host.

- **macOS:** `.dmg` (installer) and `.app.tar.gz` + `.sig` (update asset). Ad-hoc signed (`bundle.macOS.signingIdentity: "-"`), so Apple Silicon doesn't report the app as "damaged". Users still have to allow it once in **System Settings → Privacy & Security**. Apple signing and notarization are out of scope for Alpha.
- **Windows:** NSIS `-setup.exe` + `.sig`. The installer is also the update asset. No MSI.
- No Linux build.

## Local signed build (optional)

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/agent-orchestrator.key"
# or: export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/agent-orchestrator.key)"
pnpm run tauri:build
```

## Notes

- The `.vsix` is attached to the same GitHub Release as the desktop installers and bundled inside the desktop app; it does not auto-update from GitHub.

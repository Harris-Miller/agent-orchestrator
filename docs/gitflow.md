# Gitflow (branch model)

| Branch    | Role                                                                       |
| --------- | -------------------------------------------------------------------------- |
| `develop` | Default integration branch. Feature / fix PRs merge here.                  |
| `main`    | Release branch. Only release PRs merge here; that push runs release CI/CD. |

## Day-to-day

1. Branch from `develop`.
2. Open a PR **into `develop`**.
3. Merge when CI is green.

## Cut a release

1. From `develop`, create a short-lived `release/x.y.z` branch.
2. Bump the product version with `pnpm version:app <patch|minor|major|…>` (one commit; syncs root, Tauri, Cargo, and VS Code manifests — **no git tag**).
3. Open a PR **into `main`** (the release MR).
4. Merge when CI is green. Push to `main` triggers product release CI (see `apps/desktop/docs/alpha-release.md`): draft GitHub Release `vX.Y.Z` with desktop installers + VS Code `.vsix`.
5. Release CI fast-forwards `develop` to `main` when possible. If that FF fails, fix divergence by hand (no force-push from CI).

GitHub’s repository default branch is `develop` so new PRs target it unless you change the base.

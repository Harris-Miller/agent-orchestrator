# Gitflow (branch model)

| Branch | Role |
| --- | --- |
| `develop` | Default integration branch. Feature / fix PRs merge here. |
| `main` | Release branch. Only release PRs merge here; that push runs release CI/CD. |

## Day-to-day

1. Branch from `develop`.
2. Open a PR **into `develop`**.
3. Merge when CI is green.

## Cut a release

1. On `develop` (or a short-lived `release/*` branch), bump versions and finish release notes.
2. Open a PR **into `main`** (the release MR).
3. Merge when CI is green. Push to `main` triggers desktop release packaging (see `apps/desktop/docs/alpha-release.md`).
4. Merge `main` back into `develop` if the release commit is not already on `develop` (keeps histories aligned).

GitHub’s repository default branch is `develop` so new PRs target it unless you change the base.

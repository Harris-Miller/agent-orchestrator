# Gitflow (branch model)

| Branch    | Role                                                                                      |
| --------- | ----------------------------------------------------------------------------------------- |
| `develop` | Default branch. Feature and fix PRs squash-merge here.                                    |
| `main`    | Release branch. Only release PRs (`develop` → `main`) merge here; each push is a release. |

Both branches are protected by rulesets: no direct pushes, no force pushes, and every merge goes through a PR with green checks.

## Day-to-day

1. Branch from `develop`.
2. Open a PR **into `develop`** with a title in the form `<Tag>: <Short description>` (checked by `pr-title.yml`).
3. Squash-merge when CI is green. The PR title becomes the commit message on `develop`.

### PR title tags

The tag decides whether the change is released (`release.config.mjs`) and groups it in the release notes.

| Tag        | Use for                                    | Releases |
| ---------- | ------------------------------------------ | -------- |
| `New`      | A new feature                              | yes      |
| `Update`   | A change to an existing feature            | yes      |
| `Fix`      | A bug fix                                  | yes      |
| `Breaking` | A change that breaks settings or user data | yes      |
| `Docs`     | Documentation only                         | no       |
| `Build`    | Build, CI, or release tooling              | no       |
| `Upgrade`  | Dependency upgrades                        | no       |
| `Chore`    | Refactors, tests, and other internal work  | no       |

During Alpha every releasable tag is a patch (`0.1.x`).

## Cut a release

1. Open a PR from `develop` **into `main`** (the release PR). Its title still has to pass the title check, e.g. `Chore: Release`; it doesn't affect the version.
2. Merge it with a **merge commit** (the `main` ruleset allows only that), so `main` keeps `develop`'s commits.
3. The push to `main` runs release CI: semantic-release computes the version from the commits since the last `v*` tag and CI builds a draft GitHub Release. See [`apps/desktop/docs/alpha-release.md`](../apps/desktop/docs/alpha-release.md).

Versions come from git tags; nothing commits a version back. `develop` is never fast-forwarded to `main`, so after each release `develop` shows one commit "behind" `main` (the release merge commit). That's expected: the next release PR still merges cleanly.

Hotfix branches from `main` are not used: every fix goes through `develop` and the next release.

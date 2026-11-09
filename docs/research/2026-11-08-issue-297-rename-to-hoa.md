# Issue #297: rename to "Harness Orchestrating Agents" (HOA)

Plan only; nothing implemented. Product home moves from `~/.ao` to `~/.hoa` as a **breaking change with no migration code**. The owner deletes `~/.ao` by hand.

## Decisions

| Decision                                                   | Choice                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Display name                                               | `Harness Orchestrating Agents`; short form `HOA`                     |
| Home dir                                                   | `~/.hoa` (constant `HOA_HOME_DIRNAME = '.hoa'`)                      |
| Migration                                                  | None. No fallback read of `~/.ao`, no copy, no warning               |
| Internal identifiers (package scope, view IDs, OTEL names) | Rename to `hoa` (see inventory). Pre-alpha, single user, no compat   |
| GitHub repo / local checkout directory                     | Out of scope. Owner renames; GitHub redirects old URLs               |
| Historical `docs/research/*` and ADR prose                 | Leave research untouched; update live path mentions in ADRs/GLOSSARY |

## Owner-side effects (not code)

- `rm -rf ~/.ao` by hand. Lost: `settings.json`, session usage, harness caches, **pinned sessions** (user-authored), provider runtimes.
- Provider runtimes must be reinstalled from Settings > Providers into `~/.hoa/providers/`.
- Changing the Tauri `identifier` gives the desktop app a new app-data / webview storage origin, so webview `localStorage` UI prefs (e.g. `themePaintCache`, developer panel) reset once. Acceptable.

## Inventory and changes

**1. Home seam: `libs/ao-home` → `libs/hoa-home`** (58 files reference it, ~100 hits)

- `git mv libs/ao-home libs/hoa-home`; package `@lib/ao-home` → `@lib/hoa-home`; update every import and `workspace:^` dependency (`apps/vscode`, `libs/ui`, `libs/context-services-*`, `apps/desktop`, …), then `pnpm i` (never hand-edit the lockfile).
- `libs/hoa-home/src/home.ts`: `AO_HOME_DIRNAME = '.ao'` → `HOA_HOME_DIRNAME = '.hoa'`; rename its 13 usages (`providers.ts`, `index.ts`, `context-services-tauri/src/mapNpmScope.ts`, tests).
- `providers.ts` display path helper builds `~/.hoa/providers/...` from the constant, so it follows automatically.
- Fixture strings `/home/operator/.ao/...` → `.hoa` in tests across `libs/hoa-home`, `libs/ui/src/host/*.test.ts`, `libs/ui/.../userSettings.atoms.test.ts`, `libs/context-services-vscode-webview/.../makeHostServicesLive.test.ts`, `libs/context-services-tauri/.../mapNpmScope.test.ts`.
- Doc comments mentioning `~/.ao` in `providerRuntime.ts`, `acpLaunchCommand.ts`, `AtomicFile.ts`, `antigravity.ts`, `ProviderRuntimeDocument.ts`.

**2. Rust / Tauri (must stay in lockstep with #1)**

- `apps/desktop/src-tauri/src/lib.rs`: three `.join(".ao")` / `".ao/providers/..."` sites (~L136, 180, 230) plus test fixtures (~L364-380) → `.hoa`.
- `apps/desktop/src-tauri/capabilities/default.json`: shell-scope validator regex `\\.ao/providers/(...)` → `\\.hoa/providers/(...)`. Missed regex = install spawn silently denied.
- `tauri.conf.json`: `productName` → `HOA` (binary / bundle name; keep ASCII, no spaces), window `title` → `Harness Orchestrating Agents`, `identifier` → `com.hoa`.
- `keepAwake.ts` `--who=Agent Orchestrator` and the matching capability args `--who=Agent Orchestrator` must change **together** (exact-match scope) → `--who=Harness Orchestrating Agents`; update `keepAwake.test.ts`.
- Cargo crate `desktop` / `desktop_lib`: leave.

**3. Display strings**

- `apps/desktop/index.html` `<title>`; `WorkbenchNavRail.tsx:159` heading; VS Code `sidebarViewProvider.ts` (two `<title>`s).
- Long name in nav rail may be too wide for the rail: check truncation (`noWrap` already set) and consider `HOA` / two-line.

**4. VS Code extension (`apps/vscode`)**

- `package.json`: `name` `agent-orchestrator-vscode` → `hoa-vscode`; `displayName`, `description`; `repository.url` stays until the GitHub repo is renamed.
- View/container/command IDs `agentOrchestrator.*` → `hoa.*` in `package.json`, `extension.ts`, `sidebarViewProvider.ts` (`viewType`). Command title `Agent Orchestrator: Hello World` → `HOA: Hello World`.
- Root `package.json`: `name` → `hoa`; `--filter=agent-orchestrator-vscode` in `vscode:build` / `vscode:dev` → `hoa-vscode`. Check `turbo.json` / CI for the same filter.
- `vite.config.ts` library name `AgentOrchestratorWebview` → `HoaWebview`.

**5. Observability**

- `serviceName` `agent-orchestrator-desktop` / `-vscode` → `hoa-desktop` / `hoa-vscode` (both `ObservabilityLive.ts`). `compose.yml` `container_name` → `hoa-otel-lgtm`. Existing Grafana dashboards keyed on the old service name will need re-pointing.

**6. Logo / icons**

- **Chosen: candidate 4, glow wordmark** (`docs/research/icons/hoa/hoa-glow-wordmark.svg`). Other candidates and the board stay in `docs/research/icons/hoa/` for reference.
- VS Code activity-bar glyph: a 24px mono "hoa" is illegible, so use just the stroked `h` (same stroke style, `currentColor`, no glow).
- Desktop: rasterize the chosen SVG to a 1024px PNG, run `pnpm --filter=desktop tauri icon <png>` to regenerate `apps/desktop/src-tauri/icons/*` (icns/ico/png set).
- Favicon: `apps/desktop/index.html` still points at `/tauri.svg`; replace with the chosen SVG in `public/` and delete `tauri.svg`.
- VS Code: `resources/icon.svg` is a monochrome `currentColor` 24px activity-bar glyph, so it needs a one-colour simplification of the chosen mark (candidates 1, 3, 4, 6 reduce well; 2 and 5 are fine too). Marketplace `icon` PNG is optional now.
- New SVGs are single-file, no fonts, so they are safe to commit as-is.

**7. Docs**

- `GLOSSARY-MAP.md` (ao-home row, two cross-context lines, term index) and `libs/hoa-home/GLOSSARY.md` / `README.md`: rename term `ao-home` → `hoa-home`, "Agent Orchestrator home (`~/.ao`)" → "HOA home (`~/.hoa`)". Per `docs/agents/domain.md`, keep glossary entries in sync.
- ADRs with live path mentions: `libs/hoa-home/docs/adr/0002–0004`, `apps/desktop/docs/adr/0014, 0016, 0017`, `apps/desktop/README.md`, `apps/desktop/GLOSSARY.md`, `apps/vscode/README.md|GLOSSARY.md`, `libs/ui/README.md`, `libs/effect-acp/GLOSSARY.md`, root `README.md` title. Superseded ADRs (0006, 0014 body) keep their historical text; only retarget the path if it is a live reference.
- Add one short ADR in `docs/adr/` (system-wide): "Rename to HOA; `~/.ao` → `~/.hoa` with no migration", recording that the break is intentional.
- Leave `AGENTS.md` / `CLAUDE.md` issue-tracker slug `Harris-Miller/agent-orchestrator` until the repo is renamed.

## Order of work

1. `git mv` + package/constant rename (#1), `pnpm i`.
2. Rust + capabilities + tauri.conf + keepAwake (#2), together.
3. Display strings, VS Code IDs, OTEL (#3-5).
4. Docs and ADR (#7).
5. Icons once a logo is picked (#6).

Mostly mechanical: do it as one branch/PR (never commit on `main`).

## Verification

- `rg -n '\.ao\b|ao-home|AO_HOME|aoHome|agent-orchestrator|agentOrchestrator|Agent Orchestrator' --glob '!docs/research/**' --glob '!pnpm-lock.yaml'`: only intentional leftovers (repo slug, historical ADR text).
- `pnpm run local-ci` passes (includes the Rust tests with the new `.hoa` fixtures).
- Oxlint `--fix` and Oxfmt on every changed file, per-package.
- Manual smoke: after `rm -rf ~/.ao`, launch desktop → `~/.hoa/settings.json` created; Settings > Providers install lands under `~/.hoa/providers/<id>/runtime/<version>` and spawns (exercises the capability regex); keep-awake spawn works; VS Code sidebar view opens under the new `hoa.sidebar` ID.

## Risks

- Capability regex and `--who` args are the only places where a miss fails silently at runtime rather than in tests/types.
- `pnpm i` after the directory rename changes lockfile importers; commit the regenerated lockfile.
- Bundle identifier change orphans old webview storage (see above).

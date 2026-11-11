# Issue #334: "Match VS Code theme" in Settings > Appearance

Date: 2026-11-10  
Question: What are the options for resolving [#334](https://github.com/Harris-Miller/agent-orchestrator/issues/334)? The issue asks for a "match vscode theme" option with three properties: it is shown in both `apps/desktop` and `apps/vscode`, it overrides the Theme selection only in `apps/vscode`, and it is on by default. It also asks whether the app can read the active VS Code theme's colors and generate a matching MUI theme on the fly, or failing that, read the theme from disk.

Scope: research only. No source edits. Repo at `5d22a4b`. VS Code sources were read from `microsoft/vscode@main` (HEAD `8ebd863d` on 2026-11-10). Related notes: [2026-11-05-mui-retheme-agent-harness-look.md](./2026-11-05-mui-retheme-agent-harness-look.md) (theme tokens) and [2026-09-17-vscode-extension-development.md](./2026-09-17-vscode-extension-development.md).

## Summary

**Yes, it is possible, and the cheap path is the one the issue hoped for.** VS Code already writes every color the active theme resolves into the webview as `--vscode-*` CSS custom properties on `<html>`. It rewrites them whenever the theme changes. Today the webview reads two of them (`--vscode-foreground` and `--vscode-font-family`) in its shell CSS. Reading the rest with `getComputedStyle` and mapping them into the existing `ThemeColors` shape is enough to build a matching MUI theme. It needs no extension-host code, no Host IPC, and no theme files read from disk.

| Option                                                             | What                                                                                                               | Cost                                                                                     | Fidelity                                                     | Verdict         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| **A. Read `--vscode-*` CSS vars in the webview**                   | `fromVscode()` maps resolved CSS vars into `ThemeColors`, passes them to `createAppTheme`, and re-runs on mutation | Small. Mostly `libs/ui/src/theme/*`, one settings key, and a prop from `apps/vscode`     | Exact: these are the colors VS Code itself resolved          | **Recommended** |
| B. Extension host reads the theme JSON from disk                   | Find `workbench.colorTheme`'s file through `extensions.all`, parse it, push it over Host IPC                       | Large: JSONC, `include` chains, missing registry defaults, a new IPC message             | Worse than A: has to re-implement VS Code's color resolution | Reject          |
| C. Kind only (light/dark/HC)                                       | Map the body class or `activeColorTheme.kind` to an existing preset                                                | Tiny                                                                                     | Low: matches only light vs dark                              | Fallback only   |
| D. MUI `cssVariables` + `nativeColor`, palette = `var(--vscode-…)` | The palette references VS Code vars directly, and the browser does the color math                                  | Large: every JS `alpha`/`darken` call (17 in `themes.ts`, 6 elsewhere) throws on `var()` | Exact, with live updates for free                            | Not now         |
| E. Defer                                                           | Leave as `priority:low`                                                                                            | None                                                                                     | n/a                                                          | Viable          |

**Data model.** Make it a **separate boolean** User setting (e.g. `matchVscodeTheme`, absent → `true`). Do not add a sixth `ThemeId`. Both Hosts read and write the same `~/.hoa/settings.json`. A `'vscode'` ThemeId chosen in VS Code would therefore overwrite the desktop's `theme`, and the issue wants the override to apply only in VS Code.

## 1. How theming works today

- **ThemeId is a closed union** of `original | latte | frappe | macchiato | mocha` (`libs/ui/src/theme/themeId.ts:1-4`). `themes` is a precomputed `Record<ThemeId, Theme>` (`libs/ui/src/theme/themes.ts:1128-1134`).
- **Every theme goes through one function.** `createAppTheme(c: ThemeColors)` (`themes.ts:71`) takes a 35-field `ThemeColors` record (`themes.ts:10-46`). That record covers backgrounds, divider, text tiers, primary/secondary/status triplets, scrollbar, switch track, and `mode`. Presets are `ORIGINAL_COLORS` (`themes.ts:955-992`) and `fromCatppuccin()` (`themes.ts:995-1034`). **A VS Code theme is one more `ThemeColors` producer.** Nothing below `createAppTheme` has to change.
- **AppThemeProvider** reads `themeAtom` and renders `<ThemeProvider theme={themes[themeId]}>` (`libs/ui/src/theme/AppThemeProvider.tsx:9-17`). Both Hosts mount it: desktop at `apps/desktop/src/App.tsx:26`, and VS Code at `apps/vscode/src/webview/App.tsx:95`, followed by `<CssBaseline />` at `:96`.
- **themeAtom** returns the localStorage paint cache until User settings load. After that it returns `clampThemeId(settings.theme)`, and writes go to both (`libs/ui/src/atoms/userSettings/userSettings.atoms.ts:193-208`). The paint cache key is `hoa-desktop-theme`, clamped to `ThemeId` (`libs/ui/src/theme/themePaintCache.ts:5-29`).
- **User settings** stores `theme` as a plain `Schema.String` (`libs/hoa-home/src/UserSettings.ts:22`). The schema passes unknown keys through (`UserSettings.ts:6-25`).
- **Both Hosts share one settings file.** `settings.json` lives under `os.homedir()/.hoa` (`libs/hoa-home/src/home.ts:15, 25-29`). In VS Code, `homedir` comes from the extension-host OS snapshot (`libs/context-services-vscode-webview/src/OsSnapshotLive.ts:16-23`), which is the same user home. Any key one Host writes is the value the other Host reads. (Under Remote-SSH/WSL the extension host has its own `~/.hoa`. The boolean recommendation below holds either way.)
- **The Settings UI is shared.** The Appearance pane is one row holding `<ThemeSelect />` (`libs/ui/src/components/SettingsCategoryContent.tsx:13-20`). `ThemeSelect` lists `THEME_IDS` with labels (`libs/ui/src/components/ThemeSelect.tsx:13-46`).
- **The webview shell already uses VS Code vars.** Its body CSS sets `color: var(--vscode-foreground)`, `font-family: var(--vscode-font-family)`, and `background: transparent` (`apps/vscode/src/sidebarViewProvider.ts:18-35`). MUI's `CssBaseline` then paints `body` with the app theme's `background.default`. That is why the sidebar shows HOA's palette and not the sidebar color today. The CSP already allows `'unsafe-inline'` styles (`sidebarViewProvider.ts:128`), so reading computed styles needs no CSP change.
- **File-icon packs are keyed by ThemeId** (`libs/ui/src/components/sessionChat/fileChipIcons/resolveFileChipIcon.ts:42-50`; ADR `libs/ui/docs/adr/0003-theme-split-file-icon-packs.md`). A dynamic VS Code theme has no ThemeId, so it needs a pack rule, e.g. by `mode`. ADR 0003 also rejected `workbench.iconTheme` IPC. Matching the color theme does not reopen that decision.

## 2. What VS Code exposes (primary sources)

### Webview CSS variables: the full resolved palette, kept up to date

- The docs say theme colors are exposed as CSS variables: "prefixed with `vscode` and replace the `.` with `-`. For example `editor.foreground` becomes `var(--vscode-editor-foreground)`." `body` gets a theme class and `data-vscode-theme-id`. ([Webview guide, "Theming webview content"](https://code.visualstudio.com/api/extension-guides/webview))
- **Source of the values.** `themeing.ts` iterates `colorRegistry.getColorRegistry().getColors()` and emits each color the active theme resolves (`theme.getColor(entry.id)`) as `'vscode-' + entry.id.replace('.', '-')`. A non-global `replace` changes only the first dot. It also emits `vscode-font-family`, `vscode-font-size`, `vscode-editor-font-*`, and theme-kind classes `vscode-light | vscode-dark | vscode-high-contrast | vscode-high-contrast-light`. It recomputes on `onDidColorThemeChange` and on editor font setting changes. ([`src/vs/workbench/contrib/webview/browser/themeing.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/themeing.ts))
- **Where and when they are applied.** `applyStyles(document, body)` deletes every `--vscode-*` property from `document.documentElement.style` and re-adds the new set. It sets the class plus `data-vscode-theme-kind`, `data-vscode-theme-id`, and the deprecated `data-vscode-theme-name` on `body`. It runs when content is first built, so the vars exist before the bundle's scripts run. It runs again on every `styles` host message. ([`src/vs/workbench/contrib/webview/browser/pre/index.html`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/index.html)) **A theme switch therefore shows up as a mutation of `<html style>` and `<body class>`, which a `MutationObserver` can catch.**
- **Value format is MUI-safe.** `Color.toString()` returns `Color.Format.CSS.format`, which is `formatHex` for opaque colors and `formatRGBA` otherwise ([`src/vs/base/common/color.ts:550-555, 657-663`](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/color.ts)). MUI's `decomposeColor` accepts `#…`, `rgb/rgba/hsl/hsla/color()`, including 8-digit hex (`hexToRgb` splits into 4 groups and returns `rgba`). It **throws** on anything else (`node_modules/@mui/system/colorManipulator/colorManipulator.js:50-65, 78-90`, @mui/system 9.5.0). One hazard remains: a color the theme leaves unresolved is **not emitted**, so `getPropertyValue` returns `''`. Every key needs a fallback.
- **Color IDs used in the mapping below** are confirmed verbatim in the [Theme Color reference](https://code.visualstudio.com/api/references/theme-color): `sideBar.background`, `sideBar.foreground`, `focusBorder`, `button.background`, `button.foreground`, `button.hoverBackground`, `input.background`, `input.border`, `dropdown.background`, `list.activeSelectionBackground`, `list.hoverBackground`, `widget.border`, `descriptionForeground`, `errorForeground`, `textLink.foreground`, `badge.background`, and `scrollbarSlider.background`. `editor.background`, `editorWidget.background`, `panel.border`, `editorWarning.foreground`, `editorInfo.foreground`, `charts.green`, and `foreground` were confirmed in the reference's Markdown source ([`theme-color.md`](https://code.visualstudio.com/api/references/theme-color.md)).

### Extension API: kind only

- `vscode.window.activeColorTheme: ColorTheme` and `onDidChangeActiveColorTheme: Event<ColorTheme>` exist. `ColorTheme` exposes only `kind: ColorThemeKind` (`Light=1, Dark=2, HighContrast=3, HighContrastLight=4`) and no colors (`node_modules/@types/vscode/index.d.ts:8681-8710, 11846-11851`, @types/vscode 1.140.0, matching `engines.vscode ^1.140.0` in `apps/vscode/package.json:93-94`). The issue's first hope, getting colors through the extension API, is not available. The webview CSS-var route gives the same result.

## 3. Options

### A. Read `--vscode-*` vars in the webview → `fromVscode()` → `createAppTheme` (recommended)

**What.**

1. Add a `fromVscode(read: (id: string) => string, kind)` producer of `ThemeColors` next to `fromCatppuccin`. Each field takes the first non-empty var from a short chain and otherwise falls back to the kind-matched preset (`ORIGINAL_COLORS` for dark, Catppuccin Latte for light). The fallback keeps `createAppTheme` from ever receiving `''`. A suggested mapping:

   | `ThemeColors`                                          | VS Code var chain → fallback                                                                                   |
   | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
   | `bgDefault`                                            | `sideBar.background` (view is `hoa.sidebar`, `sidebarViewProvider.ts:38`) → `editor.background` → preset       |
   | `bgPaper`                                              | `dropdown.background` → `input.background` → preset                                                            |
   | `divider`                                              | `widget.border` → `panel.border` → `alpha(textPrimary, 0.09)`                                                  |
   | `textPrimary` / `textSecondary`                        | `sideBar.foreground` → `foreground`; `descriptionForeground`                                                   |
   | `primaryMain` / `primaryContained(Hover)` / `onAccent` | `focusBorder` / `textLink.foreground`; `button.background`; `button.hoverBackground`; `button.foreground`      |
   | `secondaryMain`                                        | `badge.background` → preset                                                                                    |
   | `errorMain`, `warningMain`, `infoMain`, `successMain`  | `errorForeground`, `editorWarning.foreground`, `editorInfo.foreground`, `charts.green`, each → preset          |
   | `*Light` / `*Dark`, `alert*Bg`                         | Derived with `lighten`/`darken`/`alpha`, as in `fromCatppuccin` (`themes.ts:995-1034`)                         |
   | `scrollbarThumb` / `scrollbarTrack`                    | `scrollbarSlider.background`; `bgDefault`                                                                      |
   | `switchTrackOff`                                       | `input.background` → preset                                                                                    |
   | `mode`                                                 | `body.dataset.vscodeThemeKind` (one value): `vscode-light`/`vscode-high-contrast-light` → `light`, else `dark` |

   Fields not listed (`textMuted`, `secondaryContained(Hover)`, `secondaryLight/Dark`, …) are derived as in `fromCatppuccin` or taken from the preset. The table is a starting point, not a complete list. Do not read the mode from body classes: on HC-light, `applyStyles` adds both `vscode-high-contrast-light` and `vscode-high-contrast` for backwards compatibility, so class sniffing depends on check order.

2. **Make the effective theme a discriminated union**, following the repo's coding style: `{ _tag: 'Preset'; id: ThemeId } | { _tag: 'Host'; colors: ThemeColors }`. Put it in one `effectiveThemeAtom`, derived from `themeAtom`, `matchVscodeThemeAtom`, and the host source (see the seam below). It cannot be a prop on `AppThemeProvider`, because three components read the theme: `AppThemeProvider` (`AppThemeProvider.tsx:10`), `ThemeSelect` (which must know to disable itself, `ThemeSelect.tsx:23`), and `FileChipIconView` → `packIdForTheme` (`FileChipIconView.tsx:30-31`). `AppThemeProvider` uses `themes[id]` for `Preset` and `createAppTheme(colors)` (memoized) for `Host`. `packIdForTheme` takes the union and picks a pack for `Host` by `mode`.
3. **Re-read on change** with a `MutationObserver` on `document.documentElement` (`attributeFilter: ['style']`) and `document.body` (`['class', 'data-vscode-theme-kind']`). Throttle it to one rebuild per frame. `applyStyles` rewrites every var in one pass.
4. **Add the setting.** Add `matchVscodeTheme: Schema.optionalKey(Schema.Boolean)` to `UserSettingsSchema`, plus a `matchVscodeThemeAtom` (absent → `true`) built like the other boolean atoms in `userSettings.atoms.ts`. Add a second Appearance `SettingsRow` (Switch). In VS Code, while it is on, `ThemeSelect` is disabled with a caption saying the VS Code theme is in use.
5. **Paint cache.** When matching is on in VS Code, skip it, because the vars are already on `<html>` before first paint. The cache stays a `ThemeId` paint hint for the `Preset` path only.

**Where the Host seam goes (sub-choice).**

- **A1, host-written source atom (simplest).**
  - `libs/ui` exports a writable `hostThemeColorsAtom: ThemeColors | undefined` (default `undefined`).
  - `apps/vscode` writes it once at boot, before first render, and again from the MutationObserver, much as `App.tsx` already pushes Workspace folders into the registry (`apps/vscode/src/webview/App.tsx:30-62`).
  - The reader and mapper still live in `libs/ui/src/theme/` so they can be unit-tested. Only the DOM wiring lives in the app.
  - Desktop never writes it, so its effective theme is always `Preset`.
  - It needs no Host services change and no ADR. The data comes from the webview's own DOM, not from a Host call.
- **A2, Host service.** Widen Host services with something like `HostColorTheme { supported: boolean; current; changes }`. Tauri declares `supported: false`, and the VS Code webview Live reads the CSS vars. This matches the precedent of "every Host declares the service explicitly, shared code hides the feature" (`libs/context-services/docs/adr/0006-widen-host-services-notifier.md`, `0007-widen-host-services-vscode-extension.md`; `supported` flags at `libs/context-services/src/Notifier.ts:23`, `VscodeExtension.ts:28`). It would reach atoms through the existing Host runtime bind slot (`libs/ui/docs/adr/0001-host-runtime-bind-slot.md`; `apps/vscode/src/webview/bindHostRuntime.ts`), which binds the Host services Live before ui Atoms load. It costs a new context-services ADR, a Tauri stub, and a mock-layer entry (`libs/ui/src/atoms/mockHostLayer.testing.ts`). It is the better fit only if shared UI must _branch_ on support, for example hiding the toggle on desktop. The issue says to show the toggle in both Hosts.

**Files.** `libs/ui/src/theme/{themes.ts,AppThemeProvider.tsx,themePaintCache.ts}`, a new `libs/ui/src/theme/vscodeCssVarTheme.ts` (reader, mapper, and observer, unit-testable with a fake `read`), `libs/ui/src/atoms/{userSettings/userSettings.atoms.ts,boundHarnessAtoms.ts}` (`matchVscodeThemeAtom`, `hostThemeColorsAtom`, `effectiveThemeAtom`), `libs/ui/src/components/{SettingsCategoryContent,ThemeSelect}.tsx`, `resolveFileChipIcon.ts`/`FileChipIconView.tsx`, `libs/hoa-home/src/UserSettings.ts`, and `apps/vscode/src/webview/App.tsx`. A2 also touches `libs/context-services{,-tauri,-vscode-webview}`.

**Trade-offs and risks.**

- (+) It uses exactly the colors VS Code resolved, including registry defaults, with live updates and no IPC. The work is mostly pure-function mapping that is easy to test.
- (−) Mapping is a judgment call: themes are designed for the workbench, not for HOA's surfaces. Some themes will look off, for example where `button.background` is weak as a primary. Expect tuning.
- (−) `ThemeColors` has more slots than VS Code has natural equivalents (`secondary*`, `success*`), so those will often be preset fallbacks.
- **High contrast.** These themes rely on `contrastBorder` and `activeBorder` outlines more than fills. A plain fill mapping will under-represent them. Either accept that or add an HC branch, which would raise border widths in `createAppTheme`.
- No back-compat concern: the project is pre-alpha, and an absent key means on.

### B. Extension host reads theme files from disk (issue's alternative)

**What.** In the extension host:

1. Read `workspace.getConfiguration('workbench').get('colorTheme')`.
2. Find the contributing extension in `vscode.extensions.all` through `packageJSON.contributes.themes[]` (`packageJSON: any`, `index.d.ts:8367`).
3. Read its theme JSON and follow `include` chains.
4. Merge in `workbench.colorCustomizations`.
5. Push the result over a new Host IPC message that follows the `WorkspaceFoldersChanged` pattern (`libs/context-services-vscode-webview/src/protocol/messages.ts:221`; `apps/vscode/docs/adr/0004-workspace-folder-via-host-ipc.md`), and re-send on `onDidChangeActiveColorTheme`.

**Trade-offs.** Theme files are sparse. Any color a theme omits gets VS Code's registry default, which the extension cannot read: `ColorTheme` exposes only `kind`. B therefore re-implements VS Code's color resolution and still ends up with fewer, less correct colors than option A gets for free (see §2, `themeing.ts`). It adds a protocol message, extension code, and file-format parsing (theme files are JSON-with-comments). **Reject** unless colors are needed somewhere that has no webview. No such place exists in this repo.

### C. Kind only

**What.** Map `vscode-light`/`vscode-dark`/HC (or `activeColorTheme.kind`) to an existing preset, e.g. light → `latte` and dark → `original`.

**Trade-offs.** It costs a few lines but does not "match" any theme beyond brightness. It is useful only as **A's fallback** when a var is missing, and A already needs kind for exactly that.

### D. MUI CSS-variables theme with `nativeColor`

**What.** Use `createTheme({ cssVariables: { nativeColor: true } })` and set palette entries to `var(--vscode-…)`. MUI then derives `light`/`dark` with `color-mix(in oklch, …)` (`@mui/material/styles/createThemeWithVars.d.ts:35`, `createThemeWithVars.js:152-156`, `createPalette.js:112-114`), so theme changes need no JS re-read.

**Trade-offs.** JS color math is spread across the codebase: 17 `alpha`/`darken`/`lighten`/`getContrastText` calls inside `createAppTheme`, plus 6 calls in 4 component files. All of them throw on `var()` strings (`colorManipulator.js:88-90`), so every call would have to move to color-mix or `theme.alpha`. It also switches **both** Hosts to MUI's CSS-variable theme mode, which is a cross-cutting change for one VS Code-only feature. Revisit it only if the app adopts MUI CSS variables for other reasons.

### E. Defer

The issue is labeled `priority:low`. Nothing else depends on it. Deferring costs nothing. Option A is self-contained enough to pick up later without design drift.

## 4. Recommendation

Do **A with the A1 host-written source atom**:

- `fromVscode()` with per-key var chains and kind-matched preset fallbacks.
- A `Preset | Host` union held in `effectiveThemeAtom`, read by `AppThemeProvider`, `ThemeSelect`, and `FileChipIconView`.
- MutationObserver re-read.
- `matchVscodeTheme` boolean, absent → `true`.
- A second Appearance row shown in both Hosts. `ThemeSelect` is disabled in VS Code while matching.

Ship with fills-only mapping, and treat high contrast as follow-up polish. Prefer A2 only if you decide the desktop should hide or explain the toggle based on Host support rather than show it statically.

## 5. Open questions for you

1. **Desktop presentation.** The issue says to show the toggle on desktop, where it does nothing. Should it show enabled with a caption like "Applies in the VS Code extension", show disabled, or be hidden? If hidden, use A2.
2. **Mapping choices.** Primary: `button.background` or `focusBorder`/`textLink.foreground`? Paper: `dropdown.background`, `editorWidget.background`, or `sideBar.background`, giving a flat look?
3. **Font.** Also adopt `--vscode-font-family`/`--vscode-font-size` for MUI typography (`tokens.ts:5` `FONT_FAMILY_UI`, 13px base) when matching? The shell already sets them on `body`, but MUI typography overrides them.
4. **File-icon pack** for a `Host` theme: by mode (dark → `original`, light → `catppuccin-latte`), or always `original` (the vscode-icons pack)?
5. **High-contrast themes.** Accept a fill-only approximation, or add border emphasis in `createAppTheme` for the HC kinds?
6. **Toggle scope.** Should "on by default" also apply to people who already picked a non-default `theme`? Pre-alpha says yes, simply. Absent → on.

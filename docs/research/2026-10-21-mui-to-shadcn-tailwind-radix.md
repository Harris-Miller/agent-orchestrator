# MUI → shadcn/ui + Tailwind + Radix (or Base UI) for shared UI

Date: 2026-10-21  
Question: What would it take to migrate agent-orchestrator off MUI (`@mui/material` ^9.5.0, `@mui/icons-material` ^9.5.0, `@emotion/react`, `@emotion/styled`) onto the stack the user associates with other agent-harness GUIs — shadcn/ui, Tailwind CSS, Radix UI, Lucide, and CVA (`class-variance-authority`) — given that UI now lives in shared `libs/ui` and is consumed by both the Tauri desktop app and the VS Code webview?

Scope: inventory and migration shape for `libs/ui` + `apps/desktop` + `apps/vscode`. Primary sources only. **Not** an implementation plan, timeline-in-weeks estimate, or dependency install.

## Summary

**Do not** start a full MUI teardown just to “match other harnesses.” Both named harnesses use shadcn-style copy-in components + Tailwind v4 + Lucide + CVA, but they **disagree on the primitive**: Orca vendors Radix (`radix-ui` + style `new-york-v4`); t3code vendors Base UI (`@base-ui/react` + style `base-mira`). Official shadcn as of July 2026 **defaults new projects to Base UI** while keeping Radix fully supported via `init -b radix` / `radix-*` styles ([changelog](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)). Chasing Radix specifically is optional extra work relative to the look; the visual language is Tailwind + CSS variables + CVA wrappers, not which headless library sits underneath.

**Smallest path that gets the look:** adopt shadcn in `libs/ui` with **one** primitive (prefer **Base UI** — aligns with this repo’s Sept 2026 Base UI research _and_ shadcn’s current default; or pin Radix if the goal is Orca parity). Wire Tailwind v4 once for both Vite hosts, replace theme tokens with CSS variables, then port screens. **Do not** run MUI + Radix + Base UI together beyond a short dual-theme cutover.

**Biggest cost:** not Chip/List/AppBar gaps (shadcn covers most of those better than raw Base UI did in September). The cost is (1) ~61 production files of Emotion/`sx` layout → utility classes, (2) interactive remounts of Menu/Dialog/Select/Popover/Snackbar, (3) replacing the ~1000-line `createTheme` system and five `ThemeId` palettes, (4) VS Code webview CSS/CSP bundling for a global Tailwind stylesheet. Effect atoms, host IPC, and non-UI libs stay.

## Sources

Primary (shadcn / Tailwind / Radix / Lucide / CVA):

- https://ui.shadcn.com/llms.txt
- https://ui.shadcn.com/docs (Open Code / not an npm component library)
- https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default (Base UI default; Radix still supported)
- https://ui.shadcn.com/docs/changelog/2026-02-radix-ui (unified `radix-ui` package for Radix styles)
- https://ui.shadcn.com/docs/components-json
- https://ui.shadcn.com/docs/installation/vite
- https://ui.shadcn.com/docs/monorepo
- https://ui.shadcn.com/docs/tailwind-v4
- https://ui.shadcn.com/docs/theming
- https://ui.shadcn.com/docs/dark-mode/vite
- Registry samples: https://ui.shadcn.com/r/styles/base-nova/button.json (imports `@base-ui/react/button` + `cva`); https://ui.shadcn.com/r/styles/radix-nova/button.json (imports `radix-ui` + `cva`)
- https://tailwindcss.com/docs/installation (via Context7 / Vite plugin docs)
- https://tailwindcss.com/docs/detecting-classes-in-source-files
- https://tailwindcss.com/docs/preflight
- https://tailwindcss.com/docs/dark-mode
- https://www.radix-ui.com/primitives/docs (and styling guide)
- https://lucide.dev/guide/packages/lucide-react
- https://cva.style/docs , https://cva.style/docs/getting-started/installation

Primary (harnesses, GitHub raw / `gh api`, not webpage scrapes):

- https://github.com/stablyai/orca — `package.json`, `components.json`, `src/renderer/src/assets/main.css`, `src/renderer/src/components/ui/button.tsx`, `src/renderer/src/lib/utils.ts`, `src/renderer/src/components/ui/` listing
- https://github.com/pingdotgg/t3code — `apps/web/package.json`, `apps/web/components.json`, `apps/web/src/index.css`, `apps/web/src/components/ui/button.tsx`, `apps/web/src/lib/utils.ts`, `apps/web/src/components/ui/` listing, `apps/desktop/package.json`, `apps/desktop/src/electron/ElectronProtocol.ts`, `apps/desktop/src/window/DesktopWindow.ts`

Primary (this repo):

- `pnpm-workspace.yaml` catalog pins
- `libs/ui/package.json`, `apps/desktop/package.json`, `apps/vscode/package.json`
- `libs/ui/src/theme/*` (`AppThemeProvider.tsx`, `themes.ts`, `themeId.ts`, `themePaintCache.ts`, `allotmentSashSx.ts`)
- `libs/ui/docs/adr/0003-theme-split-file-icon-packs.md`
- `apps/desktop/src/App.tsx`, `apps/desktop/index.html`, `apps/desktop/vite.config.ts`, `apps/desktop/src-tauri/tauri.conf.json`
- `apps/vscode/src/sidebarViewProvider.ts`, `apps/vscode/vite.config.ts`, `apps/vscode/src/webview/App.tsx`
- Prior note: `docs/research/2026-09-04-mui-to-base-ui-desktop-coverage.md`
- Installed `@mui/material@9.5.0` `package.json` peerDependencies (Emotion)

Method: re-inventory every `@mui/material` / `@mui/icons-material` import under `libs/ui`, `apps/desktop`, `apps/vscode` from source (not the Sept inventory); fetch official docs + Context7; read harness files via `gh api` raw contents; map components against current shadcn catalog + registry JSON.

---

## 0. What changed vs the 2026-09-04 Base UI note

| Topic                | Sept 4 note                                                               | Today (2026-10-21)                                                                                 |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| UI location          | Inventory of `apps/desktop/src` only                                      | Shared `libs/ui` (44 MUI files) + desktop hosts (9) + vscode webview (8)                           |
| Recommended headless | Raw **Base UI** + Tailwind                                                | User asked for **Radix**/shadcn; official shadcn now **defaults to Base UI**, still supports Radix |
| Hosts                | Desktop-focused                                                           | Must plan for **Tauri Vite** _and_ **VS Code webview IIFE + CSP**                                  |
| Gaps called out      | Chip, circular Progress, Alert, List, AppBar missing from Base UI catalog | shadcn ships **Badge**, **Spinner**, **Alert**, **Item**, layout via HTML/Tailwind — see §5        |
| Icon count           | Five icons in one desktop file                                            | **18** distinct `@mui/icons-material` icons across **15** files (desktop + vscode + libs/ui)       |
| Theme                | `apps/desktop/src/theme/theme.ts`                                         | `libs/ui/src/theme/themes.ts` (~997 lines) + `AppThemeProvider` + file-icon ADR                    |

Treat the Sept inventory as **historical**, not current.

---

## 1. Current MUI surface (this repo)

### Packages and process

| Package               | Catalog pin (`pnpm-workspace.yaml`) | Direct deps                              |
| --------------------- | ----------------------------------- | ---------------------------------------- |
| `@mui/material`       | `^9.5.0`                            | `libs/ui`, `apps/desktop`, `apps/vscode` |
| `@mui/icons-material` | `^9.5.0`                            | same                                     |
| `@emotion/react`      | `^11.14.0`                          | same                                     |
| `@emotion/styled`     | `^11.14.1`                          | same                                     |

Installed `@mui/material@9.5.0` lists `@emotion/react` / `@emotion/styled` as **optional peerDependencies** (default styling path still Emotion when those peers are present). New catalog deps for a migration must go in `pnpm-workspace.yaml` catalog; **never** hand-edit `pnpm-lock.yaml` (repo AGENTS.md). This note does not run `pnpm i`.

### File counts

- **61** production TypeScript/TSX files import `@mui/material` and/or `@mui/icons-material`.
- Split: **`libs/ui` 44**, **`apps/desktop` 9**, **`apps/vscode` 8**.
- **0** test/spec files under those trees import MUI (inventory found none).
- **`sx=` usage** appears in **52** of those MUI-touching files (dominant styling API).
- **`styled(...)` from `@mui/material/styles`:** only `libs/ui/src/components/sessionChat/ComposerChromeChip.tsx`.
- **Direct `@emotion/*` imports in app/lib source:** none found. Emotion is present as MUI’s styling runtime / peers, not as an independent CSS-in-JS surface.

### `@mui/material` APIs (unique import paths → file hit counts)

Layout / chrome (easy restyle once tokens exist):

| Import      | Files                                                             |
| ----------- | ----------------------------------------------------------------- |
| Box         | 38                                                                |
| Typography  | 31                                                                |
| Stack       | 15                                                                |
| Paper       | 10                                                                |
| Divider     | 3                                                                 |
| Container   | 1                                                                 |
| CssBaseline | 2 (`apps/desktop/src/App.tsx`, `apps/vscode/src/webview/App.tsx`) |

Interactive / behavior ports (real work):

| Import                                 | Files                                            | Notes                                              |
| -------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Button                                 | 16                                               |                                                    |
| IconButton                             | 11                                               |                                                    |
| Menu / MenuItem / MenuList             | 6 / 9 / 1                                        | composer chips, roster, launch target              |
| Dialog\*                               | Dialog 5, Actions/Content/Title 4, ContentText 2 | delete confirm, fd gate, handoff, settings restore |
| Select / FormControl / InputLabel      | 3 each                                           | `ThemeSelect`, elicitation, config                 |
| Popover                                | 2                                                | usage popover, roster                              |
| Snackbar                               | 3                                                | settings toast, desktop/vscode client errors       |
| Alert                                  | 7                                                | snackbar bodies + inline session empty states      |
| Accordion\*                            | 3 files                                          | developer panel, providers, nav rail               |
| Tabs / Tab                             | 1                                                | developer panel                                    |
| Switch / FormControlLabel              | 3 / 3                                            | settings, config options                           |
| TextField / InputBase / InputAdornment | 5 / 1 / 2                                        | settings, directory picker, search                 |
| Checkbox                               | 2                                                | elicitation                                        |
| Tooltip                                | 3                                                |                                                    |
| Skeleton                               | 2                                                | composer menus                                     |
| ButtonGroup                            | 1                                                | chat send chrome                                   |

Progress / feedback:

| Import                                                         | Files              |
| -------------------------------------------------------------- | ------------------ |
| CircularProgress                                               | 5                  | loading gates + **determinate** usage ring |
| LinearProgress                                                 | 1                  | `UsageCard`                                |
| Chip                                                           | 3                  | labels; one clickable error phase chip     |
| List / ListItem / ListItemButton / ListItemIcon / ListItemText | 5 / 4 / 5 / 3 / 10 | chat, menus, settings lists                |

Theme APIs (`@mui/material/styles`): `createTheme`, `ThemeProvider`, `alpha`, `darken`, `Theme` / `SxProps` types — **11** files import from `styles` (theme module + several `sx` typings).

### `@mui/icons-material` (18 icons, 15 files)

`Add`, `ArrowBack`, `ArrowUpward`, `Delete`, `ExpandLess`, `ExpandMore`, `FolderOpen`, `FolderOpenOutlined`, `FolderOutlined`, `KeyboardArrowDown`, `KeyboardArrowUp`, `Link`, `MoreHoriz`, `RestartAlt`, `Search`, `SettingsOutlined`, `Stop`, `SubdirectoryArrowLeft`.

Highest reuse: `ArrowBack` (5), `KeyboardArrowDown` (3), `SettingsOutlined` (3). Fallback `Link` icon in `fileChipIcons/resolveFileChipIcon.ts` is MUI; the **file-type packs themselves are not** (see below).

### Theme system

- **`AppThemeProvider`** (`libs/ui/src/theme/AppThemeProvider.tsx`): reads `themeAtom`, wraps MUI `ThemeProvider` with `themes[themeId]`.
- **`themes.ts`**: `createTheme` for five `ThemeId`s — `original` (custom dark) + Catppuccin `latte` / `frappe` / `macchiato` / `mocha` (hex from catppuccin palette). Large `components.Mui*` override table (Alert, AppBar, Button, Chip, CssBaseline scrollbars, Dialog, Menu, Switch, Tabs, …), including overrides for components **not currently imported**.
- **`ThemeSelect`**: MUI `Select` writing `themeAtom` / user settings.
- **Paint cache**: `themePaintCache.ts` / `THEME_PAINT_STORAGE_KEY` so first paint can use last theme before settings load.
- **CssBaseline**: hosts mount it; theme injects body background, selection color, scrollbar colors.
- **File icons ADR** (`libs/ui/docs/adr/0003-theme-split-file-icon-packs.md`): curated SVG packs under `libs/ui/assets/file-icons/` resolved by `ThemeId`. **Independent of Lucide / MUI icons** — keep these.

### CSS that is not MUI

| Concern               | Where                                                                                                      | Migration note                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Allotment split panes | `apps/desktop` / `apps/vscode` import `allotment/dist/style.css`; sash themed via `allotmentSashSx(theme)` | Keep allotment; retarget sash styling to CSS variables / classes         |
| `react-markdown`      | `ChatMarkdown.tsx`                                                                                         | Keep; restyle with Tailwind                                              |
| Lexical composer      | `@lexical/react` in `libs/ui`                                                                              | Keep                                                                     |
| File-chip SVG packs   | `libs/ui/src/components/sessionChat/fileChipIcons/`                                                        | Keep                                                                     |
| xterm                 | **Not present** in this repo’s app/lib source or package graphs today                                      | Risk only if added later (Orca already coexists xterm CSS with Tailwind) |
| Global `.css` files   | **None** under apps/libs today — styling is almost entirely MUI/`sx` + allotment CSS                       | Tailwind introduces the first real global stylesheet pipeline            |

### Easy chrome vs real ports

**Easy restyle:** Box/Stack/Paper/Typography/Divider/Container, Chip labels, List rows as HTML, static headers (no AppBar import remains in current inventory — Sept note’s AppBar site has moved/changed), LinearProgress → Progress bar, most `sx` spacing/color once CSS variables exist.

**Real ports:** Menu (composer model/agent/access chips, launch target), Dialog (delete, fd prerequisite, handoff, restore defaults), Select (`ThemeSelect`, elicitation forms), Popover (usage), Snackbar+Alert toasts, Accordion/Tabs in developer panel, determinate CircularProgress in `UsagePopover`, Switch/TextField form controls, focus/escape/anchor behavior and a11y.

---

## 2. What each target technology is (Oct 2026)

### shadcn/ui

From official intro: **not** a traditional npm component library. It is **Open Code** — CLI / registry copies component source into your repo so you own and edit it ([docs](https://ui.shadcn.com/docs)). `components.json` configures style, Tailwind paths, aliases, icon library; optional if you only paste by hand ([components.json](https://ui.shadcn.com/docs/components-json)).

**Primitive reality (critical):**

- History: built on Radix from 2023.
- **July 2026:** “Starting today, **Base UI is the default** component library in shadcn/ui.” Radix is **not** deprecated; `pnpm dlx shadcn init -b radix` keeps Radix; docs open on Base UI tab ([changelog](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)).
- Monorepo template `components.json` examples use `"style": "base-nova"` ([monorepo docs](https://ui.shadcn.com/docs/monorepo)).
- Registry proof: `base-nova/button.json` imports `Button` from `@base-ui/react/button` + `cva`; `radix-nova/button.json` imports `Slot` from `radix-ui` + `cva`.
- February 2026: Radix styles migrate toward the unified **`radix-ui`** package ([changelog](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui)).

Vite install docs install **`tailwindcss` + `@tailwindcss/vite`** and `@import "tailwindcss"` ([Vite install](https://ui.shadcn.com/docs/installation/vite)). Tailwind v4 page: CLI initializes v4; components updated for v4 ([tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4)).

### Tailwind CSS

- **Version shadcn expects for new projects:** **v4** (Vite plugin `@tailwindcss/vite`, CSS-first config; `components.json` `tailwind.config` left blank for v4).
- **Source detection:** scans project files; use `@source` for packages outside default detection (e.g. workspace `libs/ui` from an app CSS entry) ([detecting classes](https://tailwindcss.com/docs/detecting-classes-in-source-files)).
- **Preflight:** opinionated reset injected with `@import "tailwindcss"`; can be disabled by omitting `preflight.css` ([preflight](https://tailwindcss.com/docs/preflight)). Relevant for allotment / future terminal CSS and for VS Code webview baseline styles.
- **Dark mode:** class strategy; shadcn theming uses CSS variables under `:root` / `.dark` and `@custom-variant dark` ([theming](https://ui.shadcn.com/docs/theming), [dark mode Vite](https://ui.shadcn.com/docs/dark-mode/vite), [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode)).

### Radix UI

Unstyled accessible **primitives**; you supply all styles. Install unified `radix-ui` or per-primitive `@radix-ui/react-*` ([Radix docs](https://www.radix-ui.com/primitives/docs)). Styling-agnostic (`data-state`, etc.). shadcn’s **Radix** styles wrap primitives such as Dialog, Dropdown Menu, Popover, Select, Tabs, Tooltip, Accordion, Checkbox, Switch, Progress, Scroll Area, etc. (see component list in [llms.txt](https://ui.shadcn.com/llms.txt) — underlying package depends on `style`).

### Lucide

Package **`lucide-react`**: tree-shakable React SVG icon components ([Lucide React guide](https://lucide.dev/guide/packages/lucide-react)). shadcn `components.json` commonly sets `"iconLibrary": "lucide"`. This replaces **`@mui/icons-material` only**. It does **not** replace curated file-type icon packs in `fileChipIcons/` / ADR 0003.

### CVA (`class-variance-authority`)

Tiny helper for **type-safe variant → className** maps ([cva.style](https://cva.style/docs)). shadcn button (both Base and Radix registry variants) uses `cva` + a `cn` helper. Official CVA install is the package alone; for Tailwind conflict resolution docs recommend **`tailwind-merge`** (and historically **`clsx`**) around `cn` ([installation](https://cva.style/docs/getting-started/installation)). Observed patterns:

- Orca: `clsx` + `tailwind-merge` → `cn`
- t3code: CVA’s `cx` + `tailwind-merge` → `cn` (no separate `clsx` dep in `apps/web/package.json`)
- Current shadcn `base-nova` utils registry item re-exports `cn` from a dependency named `"cn"` (registry abstraction); harnesses still implement `cn` locally

---

## 3. How Orca and t3code actually use the stack

**Claim limited to these two repos.** No count was done across “all agent GUIs.”

### Orca (`stablyai/orca`)

| Item                     | Evidence                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| App shell                | **Electron** + **electron-vite** / Vite (`electron`, `electron-vite`, `vite` ^8.3.4 in root `package.json`) — **not Tauri**, **not Next** |
| Tailwind                 | **v4** — `tailwindcss` ^4.3.3, `@tailwindcss/vite` ^4.3.3                                                                                 |
| Primitive                | **Radix** — dep `radix-ui` ^1.6.7; `components.json` `"style": "new-york-v4"`; `button.tsx` imports `radix-ui/slot`                       |
| Base UI                  | **Not** in dependency set (search for `@base-ui/react` returned 0)                                                                        |
| shadcn                   | Vendored under `src/renderer/src/components/ui/` (~40 files: button, dialog, dropdown-menu, select, sonner, …) + root `components.json`   |
| CVA / cn                 | `class-variance-authority` ^0.7.1; `cn` = `clsx` + `extendTailwindMerge`                                                                  |
| Icons                    | `lucide-react` ^0.577.0                                                                                                                   |
| Extra (beyond user list) | `cmdk`, `sonner`, `tw-animate-css`, KaTeX CSS, **xterm** CSS imported beside Tailwind in `main.css`, `@shadcn/lint`, Monaco, TipTap, etc. |
| CSS entry                | `src/renderer/src/assets/main.css`: `@import 'tailwindcss'`, `@source not` for tests, custom `dark` variant                               |

Transferable to this repo: Vite + Tailwind v4 + copy-in `components/ui` + Lucide + CVA. **Not** transferable without adaptation: Electron main process, Orca’s custom dark variant / fonts / xterm stack.

### t3code (`pingdotgg/t3code`)

| Item      | Evidence                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell | **`apps/web`**: Vite React UI. **`apps/desktop`**: **Electron** shell that `loadURL`s a custom protocol (`t3code://app` / `t3code-dev://app`) serving that web UI (`ElectronProtocol.ts`, `DesktopWindow.ts`). **Not Tauri**. Marketing/mobile exist separately. |
| Tailwind  | **v4** — `tailwindcss` ^4.0.0, `@tailwindcss/vite` ^4.0.0 in `apps/web` (desktop also lists `tailwindcss` ^4.0.0)                                                                                                                                                |
| Primitive | **Base UI** — `@base-ui/react` ^1.4.1; `components.json` `"style": "base-mira"`; `button.tsx` uses `@base-ui/react/merge-props` / `use-render`                                                                                                                   |
| Radix     | **Not** listed in `apps/web` package dependencies                                                                                                                                                                                                                |
| shadcn    | Vendored under `apps/web/src/components/ui/` (alert, badge, button, dialog, menu, select, spinner, toast, sidebar, …) + `components.json` with extra registries `@coss`, `@spell`                                                                                |
| CVA / cn  | `class-variance-authority` ^0.7.1; `cn` = CVA `cx` + `extendTailwindMerge`                                                                                                                                                                                       |
| Icons     | `lucide-react` ^0.564.0 (+ `lucide` ^0.564.0)                                                                                                                                                                                                                    |
| Extra     | `@formkit/auto-animate`, TipTap, Clerk, custom Electron CSP (`style-src 'self' 'unsafe-inline'`), extensive `index.css` theme/variants                                                                                                                           |

Transferable: same shadcn+Tailwind+CVA+Lucide pattern with **Base UI** primitives; monorepo “UI in web package, desktop embeds it” is closer to our `libs/ui` + hosts layout than Orca’s single Electron tree.

### Cross-check vs user belief

Both harnesses use **shadcn copy-in + Tailwind v4 + Lucide + CVA**. They do **not** share one primitive: Orca = Radix, t3code = Base UI. That matches official shadcn dual support, not a single industry default.

---

## 4. Host constraints

### Tauri desktop (`apps/desktop`)

- Vite + `@vitejs/plugin-react` (`vite.config.ts`); entry `index.html` → `/src/main.tsx`. Inline dark `#13171b` on html/body only — **no** global CSS pipeline today.
- Tauri CSP: `"csp": null` in `apps/desktop/src-tauri/tauri.conf.json` (no restrictive CSP to fight Tailwind).
- Must add `@tailwindcss/vite`, import a shared CSS entry that `@source`s `libs/ui` (and desktop `src`), and keep allotment CSS import order sane vs Preflight.

### VS Code webview (`apps/vscode`)

From `sidebarViewProvider.ts` (source of truth):

- Dev: Vite origin scripts; production: `asWebviewUri` for **`dist/webview/main.js`** and **`main.css`** (`vite.config.ts` forces `assetFileNames: 'main[extname]'` and IIFE lib build).
- CSP production: `default-src 'none'; img-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-…'`. Bundled CSS via `cspSource` is allowed; inline shell styles already used.
- Shell CSS sets `html/body/#root` height/margin and `body { background: transparent; color: var(--vscode-foreground); font-family/size from VS Code }`.
- VS Code also injects theme classes (`vscode-light` / `vscode-dark` / `vscode-high-contrast`) and `--vscode-*` CSS variables ([VS Code webview theming](https://code.visualstudio.com/api/extension-guides/webview)).

**Risks:** Tailwind **Preflight** will reset margins/borders/headings/lists inside the webview and can fight allotment or any future third-party widgets; may also override expectations vs VS Code’s transparent shell. App theme today is **independent** Catppuccin/`original` via MUI — not bound to `vscode-*` classes. Dual systems (VS Code chrome vs in-webview app theme) already exist; Tailwind `.dark` must follow **`themeAtom`**, not necessarily the workbench theme, unless product decides otherwise.

### Shared `libs/ui` placement (recommendation)

**Recommend:** treat `libs/ui` like shadcn’s monorepo `packages/ui`:

- `libs/ui/components.json` + `libs/ui/src/styles/globals.css` (or similar) + vendored `libs/ui/src/components/ui/*` + `cn` helper.
- Each app’s Vite CSS entry `@import`s that globals file and adds `@source` for `libs/ui/src` **and** the app `src` (Tailwind ignores `node_modules` / gitignored packages by default — workspace source must be explicit if detection misses it).
- Optional thin `components.json` in each app pointing `ui` / `utils` aliases at `@lib/ui/...` (shadcn monorepo pattern).

**Alternative (one line):** init shadcn only in `apps/desktop`, duplicate or re-export into vscode later — faster spike, worse for shared chat/settings (reject for the real migration).

### pnpm catalog

Add `tailwindcss`, `@tailwindcss/vite`, `class-variance-authority`, `lucide-react`, `tailwind-merge`, and either `radix-ui` **or** `@base-ui/react` (not both long-term) to `pnpm-workspace.yaml` catalog; `catalog:` in package.jsons; run `pnpm i` when implementing — do not hand-edit the lockfile.

---

## 5. Component mapping (this repo’s imports)

Legend: difficulty for **observed usage** — trivial restyle / API port / custom.

| MUI API used here                                       | shadcn / stack equivalent                                                  | Difficulty       |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| Box, Stack, Container, Paper                            | `div` + Tailwind (`flex`, `gap`, `rounded`, `border`, `bg-card`, …)        | trivial restyle  |
| Typography                                              | Tailwind text utilities / optional typography block                        | trivial restyle  |
| Divider                                                 | `Separator`                                                                | trivial restyle  |
| Button, IconButton, ButtonGroup                         | `Button` / `ButtonGroup` + Lucide                                          | API port         |
| IconButton                                              | `Button size="icon"`                                                       | API port         |
| TextField, InputBase, InputAdornment                    | `Input` / `InputGroup` / `Textarea`                                        | API port         |
| Checkbox, Switch, FormControlLabel                      | `Checkbox`, `Switch`, `Label` / `Field`                                    | API port         |
| Select, FormControl, InputLabel, MenuItem (select)      | `Select`                                                                   | API port         |
| Menu, MenuItem, MenuList, ListItemIcon/Text in menus    | `DropdownMenu` (Radix style) or Base UI `Menu` via shadcn                  | API port         |
| Dialog\*                                                | `Dialog` / `AlertDialog`                                                   | API port         |
| Popover                                                 | `Popover`                                                                  | API port         |
| Tooltip                                                 | `Tooltip`                                                                  | API port         |
| Snackbar + Alert (toast)                                | `Sonner` / `Toast`                                                         | API port         |
| Alert (inline empty/error strips)                       | `Alert`                                                                    | trivial–API port |
| Accordion\*                                             | `Accordion`                                                                | API port         |
| Tabs / Tab                                              | `Tabs`                                                                     | API port         |
| Skeleton                                                | `Skeleton`                                                                 | trivial restyle  |
| LinearProgress                                          | `Progress`                                                                 | API port         |
| CircularProgress (indeterminate)                        | `Spinner`                                                                  | trivial restyle  |
| CircularProgress (**determinate** usage ring)           | **No 1:1** — small custom SVG/`conic-gradient` (same as Sept Base UI note) | custom (easy)    |
| Chip                                                    | `Badge` (labels) or `Button` chip-size variant (clickable phase chip)      | trivial–custom   |
| List / ListItem\*                                       | HTML list / `Item` — **no MUI List clone required**                        | trivial restyle  |
| AppBar                                                  | **Not imported today**; layout `header` if needed                          | n/a / trivial    |
| CssBaseline, ThemeProvider, createTheme, `sx`, `styled` | CSS variables + Preflight/base layer + `className`                         | **main cost**    |
| SvgIcon type / Link fallback icon                       | Lucide `Link` or keep tiny SVG                                             | trivial          |

### Sept gaps vs shadcn

| Sept Base UI gap  | shadcn coverage                                              |
| ----------------- | ------------------------------------------------------------ |
| Chip              | **Badge** (and button variants) — covered for label chips    |
| Circular progress | **Spinner** for indeterminate; determinate ring still custom |
| Alert             | **Alert** component + Sonner for snackbars — covered         |
| List family       | Still presentational — HTML/`Item`; not a blocker            |
| AppBar            | Still layout; Sidebar exists if a rail is desired later      |

---

## 6. Theme and icons

### How theme works today

1. User setting / paint cache → `themeAtom` (`userSettings.atoms.ts`).
2. `AppThemeProvider` selects `themes[themeId]` MUI theme.
3. `ThemeSelect` is a MUI Select over five labeled ids.
4. File-chip resolver and Agent launch icons key off the same `ThemeId` (ADR 0003).

Light/dark is **per ThemeId** (`latte` light; others dark), not a separate MUI `colorSchemes` toggle.

### What shadcn CSS variables replace

Semantic tokens (`background`, `foreground`, `card`, `primary`, `muted`, `destructive`, `border`, `ring`, …) under `:root` / `.dark` ([theming](https://ui.shadcn.com/docs/theming)). For five named themes, map each `ThemeId` to a token set (data attribute or class on `documentElement`, e.g. `data-theme="mocha"` plus `.dark` where needed) instead of only binary light/dark. Catppuccin hex already lives in `themes.ts` — port values, drop `Mui*` component override table.

### If CssBaseline / Emotion go away

- Body background, text color, selection, scrollbar styling currently come from `MuiCssBaseline` overrides — must move to the global CSS entry.
- All `sx` and the one `styled` chip break until rewritten.
- Allotment sash helper typed on MUI `Theme` must be rewritten to CSS variables.
- MUI icons and components unmount; Emotion can leave the graph once MUI peers are removed.

### Icon migration scope

- Replace **18** `@mui/icons-material` imports in **15** files with `lucide-react`.
- **Keep** `fileChipIcons` SVG packs and ADR 0003 resolution.
- `resolveFileChipIcon.ts`’s MUI `Link` fallback → Lucide `Link` (or inline SVG).

---

## 7. Effort shape (ponytail sequence)

What stays: Effect atoms / harness, host IPC (`@lib/context-services*`), ACP libs, Lexical composer logic, react-markdown pipeline, allotment layout structure, Tauri/VS Code host code unrelated to chrome.

### Phases

1. **Tooling spike (one host, preferably desktop):** Tailwind v4 Vite plugin, shared `globals.css` with tokens for `original` only, `cn` + one shadcn `Button`, prove `@source` sees `libs/ui`. No broad rewrite.
2. **Pick one primitive and freeze it in `components.json`:** Base UI (`base-*`, default) **or** Radix (`-b radix` / `radix-*` / `new-york-v4`). Do not add both.
3. **Vend shared primitives into `libs/ui`:** button, dialog, dropdown-menu, select, popover, tabs, accordion, switch, input, alert, badge, progress, spinner, sonner/toast, separator, tooltip, skeleton.
4. **Theme bridge:** implement CSS variables for all five `ThemeId`s; swap `AppThemeProvider` to class/`data-theme` setter; keep `themeAtom` API; restyle `ThemeSelect`.
5. **Screen-by-screen ports (cost centers first):**
   - `libs/ui/src/theme/themes.ts` (delete/replace)
   - `SessionChatBody.tsx`, `ChatItemView.tsx`, composer menus/chips
   - `CreateSessionDirectoryPicker.tsx`, `WorkbenchNavRail.tsx`
   - `DeveloperPanelShell.tsx`, settings panes
   - Dialogs / Snackbars / `FdPrerequisiteGate`
6. **Icons pass** (mechanical Lucide swap).
7. **VS Code host pass:** ensure `main.css` includes Tailwind build; verify CSP; tune/disable Preflight if allotment/webview shell regresses; retest transparent background.
8. **Remove** `@mui/*` and `@emotion/*` from catalog and package.jsons when greps are clean.

### Risks

| Risk                                      | Why                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Preflight vs allotment (and future xterm) | Global reset; Orca imports xterm CSS explicitly after Tailwind — plan order / overrides              |
| Dual theme during migration               | MUI ThemeProvider + CSS variables fighting; keep cutover short                                       |
| Bundle size                               | Temporary MUI+Radix/Base+Tailwind; finish removal                                                    |
| a11y regressions                          | Menu/Dialog/Select focus traps — test keyboard paths on composer chips and directory picker          |
| VS Code CSS isolation                     | IIFE + single `main.css`; Preflight vs `vscode-*` / transparent body; CSP already allows bundled CSS |
| Determinate usage ring                    | Easy custom, easy to forget                                                                          |

---

## 8. Recommendation

**A full migration is justified only if the product goal is the shadcn/Tailwind visual language (and maintainability of owned components), not because “harnesses use Radix.”** The two reference harnesses both speak shadcn+Tailwind+Lucide+CVA but split Radix vs Base UI.

**Smallest stack matching the look:**

1. shadcn copy-in components in **`libs/ui`**
2. **Tailwind CSS v4** shared stylesheet
3. **One** headless primitive — **prefer Base UI** (shadcn default since July 2026 + aligns with Sept research + matches t3code). Choose Radix only for Orca API familiarity / existing Radix muscle memory (`init -b radix`).
4. **Lucide** for toolbar icons; keep file-chip SVG packs
5. **CVA** + `cn` (`tailwind-merge` ± `clsx`/`cx`)

**Do not** add Radix and Base UI and MUI. **Do not** treat Chip/List/AppBar as the hard parts. **Do** budget for `sx` erasure, interactive overlays, five-theme token port, and VS Code webview CSS.

If the only goal is “looks more like Orca/t3,” a **theme + Badge/Button restyle on MUI** would be smaller — but that is not the stack asked about; this note assumes a real leave-MUI migration when chosen.
)

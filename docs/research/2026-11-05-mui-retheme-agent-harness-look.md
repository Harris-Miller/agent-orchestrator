# Stay on MUI, re-theme it like an agent harness (T3 Code / Orca / ChatGPT / Claude)

Date: 2026-11-05  
Question: Keeping `@mui/material` (9.5.0), how do we configure MUI's theme (spacing, type scale, border widths, radius, shadows, density, ripple/motion, focus ring, color/surfaces) so the app reads like modern agent-harness GUIs — T3 Code, Orca, ChatGPT, Claude — instead of Material Design? Which knobs are global vs per component, and what can't MUI match?

Scope: token research plus a **proposal** mapped to `libs/ui/src/theme/themes.ts` and `tokens.ts`. No source edits. This is the "stay on MUI" alternative to [2026-10-21-mui-to-shadcn-tailwind-radix.md](./2026-10-21-mui-to-shadcn-tailwind-radix.md), which covers replacing MUI. Harness background: [2026-10-29-orca-t3code-workspace-file-tree.md](./2026-10-29-orca-t3code-workspace-file-tree.md), [2026-10-29-orca-t3code-acp-gemini-antigravity.md](./2026-10-29-orca-t3code-acp-gemini-antigravity.md).

## Summary

**`themes.ts` already does most of the work.** It already has flat shadows, a 13px base, 28px controls, no uppercase, 1px hairline borders, 4–6px radii, and Paper's dark-mode overlay killed. The harness look is **not** a from-scratch re-theme. Seven Material tells remain, and each maps to one or two theme knobs:

| #   | Remaining Material tell                                                                                                                                                                                         | Fix (theme knob)                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ripple** on every ButtonBase (nothing in the repo disables it)                                                                                                                                                | `components.MuiButtonBase.defaultProps.disableRipple: true`                                                                                                    |
| 2   | **No keyboard focus ring.** The focus ripple is the only indicator today                                                                                                                                        | `focusVisible` theme key (new in 9.4). It **must ship with #1**, or keyboard users lose their only indicator                                                   |
| 3   | **Zero shadows, even on floating surfaces.** Menus and dialogs look like flat cards                                                                                                                             | Sparse `shadows` array (Tailwind `shadow-xs/md/lg` values). Drop `boxShadow: 'none'` on Menu, Popover, Dialog, Autocomplete paper                              |
| 4   | **Radius 4px on controls** vs 6–10px in harnesses                                                                                                                                                               | Keep `shape.borderRadius: 4`. Add a `RADIUS` token scale and set component radii explicitly                                                                    |
| 5   | **Grow (from `scale(0.75, 0.5625)`, height-based auto duration ≈ 280ms for a 200px menu)** on Menu, Popover and Tooltip                                                                                         | `slots.transition: Fade`, 150ms/100ms, `motion.reducedMotion: 'system'`                                                                                        |
| 6   | **Primary-tinted hover/selected/focus**: IconButton hover (bg + blue icon), text Button tinted at rest, outlined hover, list/menu/autocomplete selected, TableRow hover, InputBase hover border, `action.focus` | Neutral `alpha(text, 0.05–0.08)` everywhere, the shadcn `accent` pattern. Primary is kept for contained buttons, links, focused input border and Tab indicator |
| 7   | **Material glyphs:** Checkbox/Radio/Switch shapes, TextField floating labels, `@mui/icons-material`                                                                                                             | `defaultProps.icon/checkedIcon`; avoid `label` on TextField; icon swap (out of theme scope)                                                                    |

**Recommendation:** apply #1–#6 in `createAppTheme`, in one PR (§4). Leave `spacing` at 8 (about 210 numeric `sx` call sites). Leave `shape.borderRadius` at 4 (25 numeric `sx` radius multipliers). Optionally add a `zinc` ThemeId with shadcn's zinc palette (hex, because MUI's `alpha()`/`darken()` throw on `oklch()`). Density is already right: harness desktop controls are 28–32px and ours are 28px.

## Sources

Primary, harness source (GitHub permalinks pinned to the SHA read on 2026-11-05):

- T3 Code `pingdotgg/t3code@c52df24d`:
  - [`apps/web/components.json`](https://github.com/pingdotgg/t3code/blob/c52df24d285a072ad9c3f7ab5b3656c0be1cb0f5/apps/web/components.json) (style `base-mira`, baseColor `zinc`)
  - [`apps/web/src/index.css`](https://github.com/pingdotgg/t3code/blob/c52df24d285a072ad9c3f7ab5b3656c0be1cb0f5/apps/web/src/index.css)
  - `apps/web/src/components/ui/{button,input,menu,tooltip,dialog}.tsx` (same SHA)
- Orca `stablyai/orca@5159aff2`:
  - [`components.json`](https://github.com/stablyai/orca/blob/5159aff2e270af531976174567bf81b6f7c98de1/components.json) (style `new-york-v4`, baseColor `neutral`)
  - [`src/renderer/src/assets/main.css`](https://github.com/stablyai/orca/blob/5159aff2e270af531976174567bf81b6f7c98de1/src/renderer/src/assets/main.css)
  - `src/renderer/src/components/ui/{button,input,dropdown-menu,tooltip,dialog,card}.tsx` (same SHA)
- shadcn/ui `shadcn-ui/ui@8a353667`:
  - [`apps/v4/registry/new-york-v4/ui/*.tsx`](https://github.com/shadcn-ui/ui/tree/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui)
  - [`apps/v4/registry/styles/style-mira.css`](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/styles/style-mira.css) (the `mira` style class map used by `base-mira`/`radix-mira`)
  - [`apps/v4/registry/themes.ts`](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/themes.ts) (neutral/zinc base colors)
  - [`apps/v4/app/globals.css`](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/app/globals.css) (docs site radius derivation)
- Tailwind CSS `tailwindlabs/tailwindcss@0206409d`: [`packages/tailwindcss/theme.css`](https://github.com/tailwindlabs/tailwindcss/blob/0206409d5858cab6c1e4f2d847ecc30f6c505dfb/packages/tailwindcss/theme.css)
- OpenAI Apps SDK UI `openai/apps-sdk-ui@0f00143c`:
  - [`src/styles/variables-semantic.css`](https://github.com/openai/apps-sdk-ui/blob/0f00143c7a639906f1621fe58e1b6be7b5bea46d/src/styles/variables-semantic.css)
  - [`variables-primitive.css`](https://github.com/openai/apps-sdk-ui/blob/0f00143c7a639906f1621fe58e1b6be7b5bea46d/src/styles/variables-primitive.css)
  - [`variables-components.css`](https://github.com/openai/apps-sdk-ui/blob/0f00143c7a639906f1621fe58e1b6be7b5bea46d/src/styles/variables-components.css)
  - `src/components/{Button,Tooltip,Menu}/*.module.css` and `Button/Button.tsx`
- Claude: [geist.co/work/anthropic](https://geist.co/work/anthropic) (design studio case study). The claude.ai product CSS is not public, so no first-party token values are available.

Primary, MUI:

- Installed `@mui/material@9.5.0` / `@mui/system@9.5.0` under `node_modules/.pnpm/@mui+material@9.5.0_*/node_modules/@mui/material/` (paths below are relative to that root)
- https://mui.com/material-ui/customization/focus-visible.md (new in v9.4)
- https://mui.com/material-ui/customization/spacing.md
- https://mui.com/material-ui/transitions.md#reduced-motion
- Context7 `/mui/material-ui/v9.2.0`:
  - `docs/data/material/customization/density/density.md`
  - `getting-started/faq/faq.md` (global `disableRipple`)
  - `migration/upgrade-to-v9/upgrade-to-v9.md` (`MuiTouchRipple` removed from theme types)

This repo: `libs/ui/src/theme/themes.ts`, `tokens.ts`, `AppThemeProvider.tsx`, `themeId.ts`; `.claude/skills/material-ui-styling/SKILL.md` (read-only).

Method: fetched raw files at the pinned SHAs (`gh api` / `raw.githubusercontent.com`) and read class strings and CSS custom properties directly. Converted oklch to hex with the standard OKLab→sRGB matrices; the results match Orca's hand-written hex (`#0a0a0a`, `#171717`, `#e5e5e5`). Read the installed MUI source for defaults instead of trusting docs memory.

---

## 1. Where this repo already is

`createAppTheme(c: ThemeColors)` (`themes.ts:96`) is one factory feeding five ThemeIds (`original` + four Catppuccin flavors; `themeId.ts`). `AppThemeProvider` swaps whole `Theme` objects; there is no `cssVariables`/`colorSchemes`.

| Already harness-like                                                                           | Where                                                                            |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| All 25 shadows `'none'`                                                                        | `flatShadows`, `themes.ts:68–94`, used at `:846`                                 |
| 13px base, compact type scale, system font stack                                               | `typography`, `themes.ts:850–923`; `FONT_FAMILY_UI`, `tokens.ts:5`               |
| `textTransform: 'none'`, `letterSpacing: 0` on buttons                                         | `typography.button` `:861`, `MuiButton` `:222–293`                               |
| Dense controls: Button 28/24/32, IconButton 28/24, Input 28/24, MenuItem/ListItemButton/Tab 32 | `MuiButton`, `MuiIconButton` `:451`, `MuiInputBase` `:484`, `MuiMenuItem` `:574` |
| 1px hairline borders on Card/Dialog/Menu/Popover/Table                                         | `border: 1px solid ${c.divider}`, throughout                                     |
| Outlined input notch removed; border on InputBase                                              | `MuiOutlinedInput.notchedOutline: { border: 0 }` `:586`                          |
| Dark-mode Paper overlay neutralized                                                            | `MuiPaper.root.backgroundImage: 'none'` `:603`                                   |
| Toolbar 64px → 36px                                                                            | `MuiToolbar` `:760`, `PANEL_HEADER_HEIGHT` (`tokens.ts:2`)                       |

Still Material: the seven tells in the Summary table.

---

## 2. Token comparison

Px values assume a 16px root. Tailwind `N` spacing = `N × 0.25rem` = `N × 4px` ([Tailwind `theme.css:325`](https://github.com/tailwindlabs/tailwindcss/blob/0206409d5858cab6c1e4f2d847ecc30f6c505dfb/packages/tailwindcss/theme.css#L325)). T3 is mobile-first, so its desktop value is the `sm:` variant. Both are listed as `mobile / desktop`.

### 2.1 Scale tokens

| Token                 | shadcn new-york-v4 (default)                                                        | shadcn mira style                                                            | T3 Code (base-mira + custom)                                                          | Orca (new-york-v4 + custom)                                          | OpenAI apps-sdk-ui                                                        | MUI 9.5 default                                                          | **This repo today**                                        |
| --------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Spacing unit          | 4px (Tailwind)                                                                      | 4px                                                                          | 4px                                                                                   | 4px                                                                  | 4px (`--spacing: 0.25rem`, semantic `:46`)                                | 8px ([spacing.md](https://mui.com/material-ui/customization/spacing.md)) | 8px (default)                                              |
| Body / control text   | `text-sm` 14px (button, menu item); input `text-base md:text-sm`                    | `text-xs/relaxed` 12px / 1.625 (button, menu, card, dialog); input `text-sm` | `text-base sm:text-sm` → **14px** desktop; menu items 14px desktop                    | button `text-sm` 14px; **menu items 13px** (`text-[13px] leading-4`) | control md = 14px (`--control-font-size-md`, `:502`)                      | 14px (`createTypography.mjs:18`); button 14/1.75/uppercase (`:67`)       | **13px**; button 13/500                                    |
| Small text            | `text-xs` 12px/16px                                                                 | 10px (`text-[0.625rem]`, xs button)                                          | adds `--text-2xs` 11px, `--text-3xs` 10px (`index.css:183–186`)                       | 10–12px ad hoc                                                       | xs 12px/18px (`:465–466`)                                                 | caption 12px                                                             | caption 11px, body2 12px                                   |
| Type scale (Tailwind) | xs 12/16, sm 14/20, base 16/24, lg 18/28, xl 20/28, 2xl 24/32 (`theme.css:347–358`) | same                                                                         | same + 2xs/3xs                                                                        | same                                                                 | xs 12/18, sm 14/20, md 16/24, lg 18/29 (`:453–468`)                       | h1 96 … body1 16, body2 14                                               | h1 22, h2 18, h3 15, h4 13, h5/h6 12                       |
| Weights               | medium 500; titles semibold 600 (`dialog`, `card`)                                  | medium 500                                                                   | medium 500                                                                            | medium 500                                                           | `--button-font-weight: medium`                                            | medium 500                                                               | **`fontWeightMedium: 600`**, headings 700                  |
| Font                  | project-defined                                                                     | —                                                                            | `-apple-system, BlinkMacSystemFont, "Inter Variable", "Segoe UI", system-ui` (`:171`) | `'Geist', -apple-system, …` (`main.css:190`)                         | `ui-sans-serif, -apple-system, system-ui, "Segoe UI", …` (semantic `:14`) | Roboto                                                                   | `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` |

### 2.2 Control heights

| Control        | new-york-v4                                                                                                                                               | mira                                        | T3 (mobile / desktop)                                                                       | Orca                                                             | OpenAI                                                                              | MUI default                                                                     | **Repo**                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| Button default | `h-9` 36, `px-4` ([button.tsx](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/button.tsx)) | `h-7` 28, `px-2` (`style-mira.css:185–186`) | `h-9 / h-8` → **32**, `px-[11px]` (`button.tsx:19`)                                         | `h-9` 36 (`button.tsx:34`)                                       | `md` = 32 (`--control-size-md`, `:485`; default `size = "md"`, `Button.tsx:120`)    | about 36.5 (`padding: 6px 16px`, line-height 1.75; `Button.mjs:93`)             | **28**, `px 10`                          |
| Button sm / xs | sm `h-8` 32, xs `h-6` 24                                                                                                                                  | sm `h-6` 24, xs `h-5` 20                    | sm `h-8 / h-7` 28, xs `h-7 / h-6` 24                                                        | sm 32, xs 24                                                     | sm 28, xs 26, 2xs 24, 3xs 22                                                        | small about 30.75                                                               | small 24, large 32                       |
| Icon button    | `size-9` 36                                                                                                                                               | `size-7` 28                                 | `size-9 / size-8` 32; icon-sm 28                                                            | `size-9` 36                                                      | (uniform = control size)                                                            | 40 (8px padding + 24 icon)                                                      | 28 / 24                                  |
| Input          | `h-9` 36, `px-3`                                                                                                                                          | `h-7` 28, `px-2` (`:678`)                   | `h-8.5 / h-7.5` → **30**; sm 26 (`input.tsx:22–25`)                                         | `h-9` 36; compact `h-7` 28 (`input.tsx`)                         | control sizes as above                                                              | outlined 56 (`16.5px 14px`); small 40                                           | **28** / 24                              |
| Menu item      | `px-2 py-1.5 text-sm` → about 32 (`dropdown-menu.tsx:76`)                                                                                                 | `min-h-7` 28, `px-2 py-1` (`:546`)          | `min-h-8 / min-h-7` → **28** (`menu.tsx:132`)                                               | `py-1 leading-4` → about 24, 13px (`dropdown-menu.tsx`)          | `padding: spacing(1.5) spacing(2)` (`components.css:138`)                           | 48 (`MenuItem.mjs:64`; `auto` ≥ sm)                                             | 32                                       |
| Tooltip        | inverted (`bg-foreground text-background`), `px-3 py-1.5 text-xs`                                                                                         | `px-3 py-1.5 text-xs rounded-md`            | popover surface + `border` + `shadow-md/5`, `text-xs`, `rounded-md` (`tooltip.tsx:141–144`) | inverted, `rounded-md text-xs px-3 py-1.5` (`tooltip.tsx:35–39`) | elevated surface, `radius-md`, 14px, `shadow + hairline` (`Tooltip.module.css:3–9`) | 11px (`pxToRem(11)`), `4px 8px`, enter delay 100ms (`Tooltip.mjs:120–122, 234`) | popover surface, 12px, border, no shadow |

### 2.3 Radius, border, shadow, focus, motion

| Token                        | new-york-v4 / shadcn site                                                                                                                                                                   | mira                                                       | T3 Code                                                                                                                                                                                              | Orca                                                                                                                                       | OpenAI                                                                                                                                  | MUI default                                                                                                                                                             | **Repo**                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `--radius` base              | `0.625rem` = 10px (`themes.ts` neutral/zinc; site `globals.css:100`)                                                                                                                        | inherits project                                           | `0.5rem` = 8px (`index.css:1115`); `--control-radius: 0.5rem` (`:103`)                                                                                                                               | `0.625rem` = 10px (`main.css:195`)                                                                                                         | n/a: fixed scale                                                                                                                        | `shape.borderRadius: 4` (`@mui/system/createTheme/shape.mjs:2`)                                                                                                         | 4                                          |
| Derived scale                | **multiplier**: sm ×0.6 = 6, md ×0.8 = 8, lg 10, xl ×1.4 = 14, 2xl 18 (site `globals.css:50–56`; this is the docs-site CSS. Not verified what `shadcn init` emits today)                    | —                                                          | **subtractive**: sm −4 = 4, md −2 = 6, lg 8, xl +4 = 12, 2xl 16 (`index.css:289–294`)                                                                                                                | multiplier (same as site): 6/8/10/14/18 (`main.css:174–180`)                                                                               | 2xs 2, xs 4, sm 6, md 8, lg 10, xl 12, 2xl 16 (`semantic:32–40`)                                                                        | Tailwind default if unset: sm 4, md 6, lg 8, xl 12 (`theme.css:397–404`)                                                                                                | controls 4, papers 6                       |
| Control radius (as rendered) | `rounded-md` → **8px** in a project using the site scale                                                                                                                                    | `rounded-md`                                               | `--control-radius` **8px**; input `rounded-lg` 8; menu item `rounded-sm` 4                                                                                                                           | `rounded-md` → **8px**                                                                                                                     | sm controls 6, md controls 8 (`Button.module.css:137,149`)                                                                              | 4                                                                                                                                                                       | 4                                          |
| Popover / menu radius        | `rounded-md`                                                                                                                                                                                | `rounded-lg` (`:538`)                                      | `rounded-lg` = 8 (`menu.tsx:58`)                                                                                                                                                                     | `rounded-[11px]` (`dropdown-menu.tsx:80`)                                                                                                  | `--menu-radius: radius-xl` = 12 (`components.css:133`)                                                                                  | 4                                                                                                                                                                       | 6                                          |
| Dialog radius                | `rounded-lg`                                                                                                                                                                                | `rounded-xl` (`:468`)                                      | `rounded-2xl` = 16 (`dialog.tsx:158`)                                                                                                                                                                | `rounded-lg` = 10                                                                                                                          | —                                                                                                                                       | 4                                                                                                                                                                       | 6                                          |
| Border width                 | 1px (`border`) everywhere                                                                                                                                                                   | 1px `ring-1 ring-foreground/10` on surfaces (not `border`) | 1px; button uses a `before:` pseudo inner highlight                                                                                                                                                  | 1px                                                                                                                                        | `--shadow-hairline-width: 1px` (0.5px on hi-DPI, `primitive:258–263`)                                                                   | 1px (outlined)                                                                                                                                                          | 1px                                        |
| Border color                 | light `oklch(0.922 0 0)` #e5e5e5; dark `oklch(1 0 0 / 10%)`                                                                                                                                 | —                                                          | light zinc-200; dark `white / 8%` (`:1212`)                                                                                                                                                          | light #e5e5e5; dark `rgb(255 255 255 / 0.07)` (`main.css:368`)                                                                             | `alpha-10` light / `alpha-12` dark (`semantic:406`)                                                                                     | `rgba(0,0,0,0.12)` / `rgba(255,255,255,0.12)`                                                                                                                           | `rgba(255,255,255,0.09)`                   |
| Shadows used                 | button/input `shadow-xs`, card `shadow-sm`, menu `shadow-md`, dialog `shadow-lg`                                                                                                            | menu `shadow-md`; card/dialog none (ring only)             | composer `0 1px 2px rgb(0 0 0/5%)`; dark composer `0 14px 32px -18px rgb(0 0 0/75%)` (`:198–199`); menu `0 16px 40px -18px rgb(0 0 0/55%)` / dark `0 18px 44px -18px rgb(0 0 0/80%)` (`menu.tsx:58`) | `--shadow-floating: 0 10px 24px rgb(0 0 0/0.18)` (`main.css:173`); menu `0 6px 16px rgba(0,0,0,.14)`; dialog `0 20px 60px rgba(0,0,0,.28)` | 4-step elevation geometry `0 1px 2px -1px` … `0 8px 16px -4px` with α 0.08–0.12 light / 0.2–0.36 dark (`primitive:245–271`), + hairline | 25 Material shadows; Menu/Popover elevation 8 (`Popover.mjs:101`), Dialog 24 (`Dialog.mjs:299`), Drawer 16, Snackbar 6, AppBar 4, Paper 1                               | all `none`                                 |
| Tailwind shadow values       | `xs 0 1px 2px 0 rgb(0 0 0/.05)`; `sm 0 1px 3px 0 /.1, 0 1px 2px -1px /.1`; `md 0 4px 6px -1px /.1, 0 2px 4px -2px /.1`; `lg 0 10px 15px -3px /.1, 0 4px 6px -4px /.1` (`theme.css:406–411`) |                                                            |                                                                                                                                                                                                      |                                                                                                                                            |                                                                                                                                         |                                                                                                                                                                         |                                            |
| Focus ring                   | `focus-visible:ring-[3px] ring-ring/50` + `border-ring`                                                                                                                                     | `ring-2 ring-ring/30` + `border-ring`                      | `ring-2 ring-inset ring-ring ring-offset-1`; input `ring-[3px] ring-inset ring-ring/24`                                                                                                              | same as new-york                                                                                                                           | `outline: 2px solid var(--color-ring)`, `outline-offset: 2px` (`Button.module.css:52–55`)                                               | ripple (focus ripple); opt-in `focusVisible` = 2px solid primary, 2px offset (`createThemeNoVars.d.ts:26–30`)                                                           | ripple + InputBase `0 0 0 1px primary/22%` |
| Ring color                   | neutral gray: light `oklch(0.708 0 0)` #a1a1a1, dark `oklch(0.556 0 0)` #737373                                                                                                             |                                                            | `--ring: var(--primary)` (blue)                                                                                                                                                                      | #a1a1a1 / #737373                                                                                                                          | blue-500 / blue-400 (`semantic:63`)                                                                                                     | primary                                                                                                                                                                 | primary                                    |
| Press feedback               | none                                                                                                                                                                                        | `active:translate-y-px`                                    | `active:scale-[0.97]` (`button.tsx:9`)                                                                                                                                                               | none                                                                                                                                       | scale transform on inner layer                                                                                                          | ripple                                                                                                                                                                  | ripple                                     |
| Motion                       | Tailwind default 150ms `cubic-bezier(0.4,0,0.2,1)` (`theme.css:492–493`); menus fade + `zoom-in-95`                                                                                         | menus `duration-100`                                       | `--ease-drawer: cubic-bezier(0.32,0.72,0,1)` (`:195`); tooltip `scale-98` + opacity                                                                                                                  | fade + zoom-95                                                                                                                             | `--transition-duration-basic: 150ms`, `ease` (`semantic:518–519`)                                                                       | shortest 150, shorter 200, short 250, standard 300 (`createTransitions.mjs:21–27`); Grow auto-duration (`:36–44`); `motion.reducedMotion: 'never'` (`createMotion.mjs`) | MUI defaults                               |

### 2.4 Palette base

| Role            | shadcn neutral (Orca)                     | shadcn zinc (T3 baseColor)       | T3 actual                                                                           | OpenAI                                                      |
| --------------- | ----------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| bg (light/dark) | `#ffffff` / `#0a0a0a` (neutral-950)       | `#ffffff` / `#09090b` (zinc-950) | zinc-25 `oklch(99.2% 0 0)` / **`#000`** (`index.css:1116,1192`)                     | gray-0 `#fff` / surface gray-200 `#212121` (`semantic:560`) |
| card / popover  | `#fff` / `#171717`                        | `#fff` / `#18181b`               | white / `neutral-950 97% + white`                                                   | surface-elevated `#fff` / `#303030`                         |
| primary         | `#171717` / `#e5e5e5` (neutral, not blue) | `#18181b` / `#e4e4e7`            | **blue** `oklch(0.488 0.217 264)` ≈ `#1b4ed8` / `oklch(0.571 0.21 264)` ≈ `#346bf1` | solid primary gray-900 (neutral)                            |
| muted text      | `#737373` / `#a1a1a1`                     | `#71717b` / `#9f9fa9`            | zinc-500 / neutral-400                                                              | gray-500 / gray-700                                         |
| hover/selected  | `accent` = neutral-100 / neutral-800      | zinc-100 / zinc-800              | `accent` = zinc-100 / `white 4%`                                                    | `alpha-08` / `alpha-10` menu item bg (`components.css:137`) |

Takeaway: every harness uses **neutral** hover and selected surfaces (`accent`), never a primary tint. Primary is either neutral (shadcn defaults, Orca, OpenAI) or a single blue (T3).

### 2.5 Claude

- Verified (Geist case study): the typographic palette is **Styrene** (Commercial Type) + **Tiempos** (Klim). The color system was designed to "bring warmth to the brand" and serve product UI.
- **Unverified:** any claude.ai token values (cream surfaces, terracotta/"clay" accent, radius, control heights). The product CSS is not public and no first-party token source was found. Treat any hex values for Claude as secondary-source guesses. Styrene and Tiempos are commercial fonts and cannot be bundled without a license.

---

## 3. MUI 9.5 theming surface: knobs, scope, gotchas

| Knob                                                  | Scope                                                                         | Notes / gotchas (source)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spacing`                                             | Global: `theme.spacing()` and every numeric `sx` margin/padding/gap           | Default 8px; accepts number, function or array ([spacing.md](https://mui.com/material-ui/customization/spacing.md)). **About 210 numeric `sx` spacing props** in `libs/ui` + `apps/*` (`rg '\b(p\|m\|gap…): ?[0-9.]+'`). Changing it rescales all of them. **Keep 8.** Translate: Tailwind `N` = MUI `N/2` (`px-3` → `px: 1.5`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `shape.borderRadius`                                  | Global default for components without explicit radius; **multiplier** in `sx` | `sx={{ borderRadius: 2 }}` = `2 × shape.borderRadius` (`@mui/system/borders/borders.mjs:35`, `createUnaryUnit(theme, 'shape.borderRadius', 4, …)`). String values are literal. **25 numeric sites**; `borderRadius: 3` at `SessionChatBody.tsx:709` and `ProvidersSettingsPane.tsx:318` would go 12 → 24px at base 8. `999` stays a pill. **Keep 4**; set component radii explicitly from a token scale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `typography.fontSize` / `htmlFontSize`                | Global                                                                        | `pxToRem(n) = n / htmlFontSize × (fontSize / 14)` (`styles/createTypography.mjs:40–41`). With the repo's `fontSize: 13`, **every internal `pxToRem` size shrinks by 13/14**: Tooltip's 11px default renders as about 10.2px, unless overridden with px (the repo already uses px for Tooltip, 12). Explicit px in variants is unaffected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `typography.button.textTransform`                     | Global (Button, Tab, …)                                                       | Default uppercase (`createTypography.mjs:67`). Repo already sets `'none'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `shadows` (25 entries)                                | Global, indexed by `elevation`                                                | Length must stay 25. Component defaults: Popover/Menu 8 (`Popover.mjs:101`; Menu delegates to Popover), Dialog 24 (`Dialog.mjs:299`), Drawer temporary 16 (`Drawer.mjs:183`), SnackbarContent 6 (`:81`), AppBar 4 (`:183`), Paper/Card/Autocomplete paper 1 (`Paper.mjs:77`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Paper dark overlay                                    | Global, dark mode, `variant="elevation"`                                      | Without `cssVariables`, dark mode adds `linear-gradient(alpha(#fff, getOverlayAlpha(elevation)))` via `--Paper-overlay` (`Paper.mjs:101–108`). Repo kills it with `MuiPaper.root.backgroundImage: 'none'`. **Keep that** when shadows come back.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `components.MuiButtonBase.defaultProps.disableRipple` | Global (all ButtonBase descendants)                                           | Documented global switch (FAQ). v9 removed `MuiTouchRipple` from theme types; style the ripple via `MuiButtonBase.styleOverrides.root['& .MuiTouchRipple-root']` (upgrade-to-v9). **Disabling ripple also removes the focus ripple, the only built-in keyboard indicator, so pair it with `focusVisible`.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `focusVisible` (v9.4+)                                | Global, ButtonBase-derived + listed components                                | `createTheme({ focusVisible: true \| CSSProperties })` (`createThemeNoVars.d.ts:26–44`; CHANGELOG 9.4.0 #48743). Default 2px solid `primary.main`, offset 2. Tab, MenuItem and similar inset automatically. For a shadcn-style ring use `{ outlineColor: 'transparent', boxShadow: '0 0 0 3px …' }`. The docs say to use `transparent`, **not** `outline: 'none'`, so forced-colors mode still shows a ring. **Only one box-shadow layer is supported.** It covers Button, IconButton, Chip, Checkbox, Switch, Tab, MenuItem, ListItemButton, Link, AccordionSummary, Autocomplete, etc. (files importing it under `@mui/material/*`). **Not InputBase**: input focus stays on `MuiInputBase` `&.Mui-focused`. Button with `disableElevation` keeps `focusVisible.boxShadow` (`Button/Button.mjs:254–255`); without it the ring composes with `shadows[6]` (`:123–125`). With `focusVisible` on, MenuItem's keyboard highlight becomes `palette.action.focus` (`MenuItem/MenuItem.mjs:92–96`), not the primary tint (`:79–81`). |
| `transitions.duration` / `easing`                     | Global, MUI transitions + `theme.transitions.create`                          | `easeInOut` is already Tailwind's default curve (`createTransitions.mjs:8` vs `theme.css:493`). Durations are longer (150–375). Grow/Collapse use `'auto'` height-based durations (`:36–44`) unless `transitionDuration`/`timeout` is set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `motion.reducedMotion`                                | Global                                                                        | Default `'never'` (`styles/createMotion.mjs`); `'system'` honors `prefers-reduced-motion` (since 9.1, [transitions.md#reduced-motion](https://mui.com/material-ui/transitions.md)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `slots.transition` (Menu, Popover, Tooltip)           | Per component (via `defaultProps`)                                            | Defaults to `Grow` (`Popover.mjs:283`, `Tooltip.mjs:575`). Grow scales from `scale(0.75, 0.5625)` (`Grow/Grow.mjs:14, 27`), far more than shadcn's `zoom-in-95`. `Fade` is the closer stock option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `palette.action.*`, `divider`, `background`           | Global, read by many components' hover/selected/disabled                      | `action.hover` / `action.selected` drive MenuItem, ListItemButton, TableRow, etc. The repo sets `selected` to a primary tint (`themes.ts:796`) and re-tints in overrides (`:209, 546–549`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Color functions                                       | `alpha`/`darken`/`lighten` from `@mui/material/styles`                        | `decomposeColor` supports `#hex, rgb(), rgba(), hsl(), hsla(), color()` and **throws on `oklch()`** (`@mui/system/colorManipulator/colorManipulator.mjs:50–64`). `themes.ts` calls these at theme build, so **shadcn/Tailwind oklch tokens must be converted to hex**. Native relative color is only available with `cssVariables: { nativeColor: true }` (`createThemeWithVars.d.ts:35`), which is a bigger switch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Density (`size`, `dense`, `margin`)                   | Per component `defaultProps`                                                  | The density guide sets `size: 'small'`, `dense: true`, `margin: 'dense'`, `Toolbar variant: 'dense'` via `defaultProps` and calls it demo-only. The repo instead overrides heights in `styleOverrides`, which is more predictable for a desktop app. Keep it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `cssVariables` / `colorSchemes`                       | Global                                                                        | Not needed for this re-theme. It would let one theme carry light/dark (and custom schemes) without remounting, and enable `nativeColor`. Out of scope; note as a follow-up if ThemeId switching ever flashes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 4. Proposed changes (proposal only; not applied)

Anchored to current `libs/ui/src/theme/themes.ts` line numbers. Keeps the `ThemeColors` + Catppuccin structure. Adds one optional color token (`ring`) and a radius scale in `tokens.ts`.

```ts
// ── tokens.ts (add) ─────────────────────────────────────────────
/** Radius scale (px). T3 Code's `--radius: 0.5rem` subtractive scale: sm 4 / md 6 / lg 8 / xl 12. */
export const RADIUS = { sm: 4, md: 6, lg: 8, xl: 12 } as const;

// ── themes.ts ───────────────────────────────────────────────────
import Fade from '@mui/material/Fade';
import { RADIUS } from './tokens.ts';

type ThemeColors = {
  // …existing fields…
  /** Focus ring base color (shadcn `--ring`). Defaults to primaryMain when omitted. */
  readonly ring?: string;
};

// Replaces flatShadows (themes.ts:68–94). Tailwind shadow-xs / md / lg (theme.css:406–411);
// dark uses T3-style deeper, tighter drops (menu.tsx:58) so they read on near-black.
const makeShadows = (mode: 'dark' | 'light'): Theme['shadows'] => {
  const xs = mode === 'dark' ? '0 1px 2px 0 rgb(0 0 0 / 0.3)' : '0 1px 2px 0 rgb(0 0 0 / 0.05)';
  const md =
    mode === 'dark'
      ? '0 16px 40px -18px rgb(0 0 0 / 0.8)'
      : '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
  const lg =
    mode === 'dark'
      ? '0 20px 60px rgb(0 0 0 / 0.5)' // Orca dialog geometry (dialog.tsx:120, α .28), alpha raised for dark: adaptation, unverified
      : '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
  // Index = MUI elevation: Paper 1, Snackbar 6, Menu/Popover 8, Drawer 16, Dialog 24.
  return Array.from({ length: 25 }, (_, i) => (i === 0 ? 'none' : i <= 2 ? xs : i <= 12 ? md : lg)) as Theme['shadows'];
};

const createAppTheme = (c: ThemeColors): Theme => {
  const shadows = makeShadows(c.mode);
  const ring = alpha(c.ring ?? c.primaryMain, 0.5);
  const selected = alpha(c.textPrimary, 0.08); // shadcn `accent`: neutral, not primary-tinted

  return createTheme({
    // (2) Keyboard ring, shadcn new-york style: 3px ring at 50% (button.tsx). Box-shadow only;
    // transparent outline keeps forced-colors working (focus-visible.md).
    focusVisible: { outlineColor: 'transparent', outlineOffset: 0, boxShadow: `0 0 0 3px ${ring}` },
    motion: { reducedMotion: 'system' },
    shadows, // (3) was flatShadows
    shape: { borderRadius: 4 }, // unchanged on purpose: sx multipliers (§3)
    transitions: {
      // (5) Tailwind default 150ms; MUI easeInOut already equals Tailwind's curve.
      duration: {
        complex: 250,
        enteringScreen: 150,
        leavingScreen: 100,
        short: 150,
        shorter: 150,
        shortest: 100,
        standard: 200,
      },
    },
    typography: {
      // …existing…
      fontWeightMedium: 500, // was 600; shadcn font-medium. No sx uses 'fontWeightMedium' outside themes.ts today
      // h1–h6: fontWeight 600 (was 700), matching shadcn `font-semibold` titles
    },
    palette: {
      // …existing…
      // (6) was primary 0.08 / 0.12. MenuItem keyboard highlight reads action.focus when focusVisible is on.
      action: { /* … */ focus: alpha(c.textPrimary, 0.08), hover: alpha(c.textPrimary, 0.05), selected },
    },
    components: {
      // (1) No ripple anywhere.
      MuiButtonBase: { defaultProps: { disableRipple: true } },

      // (4) Radius bumps: controls md, floating lg, dialog xl.
      MuiButton: { styleOverrides: { root: { borderRadius: RADIUS.md /* …rest unchanged… */ } } },
      // (6) Ghost-style hover: neutral bg, icon goes to text color (was primary bg + primary icon, themes.ts:453–456).
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            '&:hover': { backgroundColor: alpha(c.textPrimary, 0.06), color: c.textPrimary } /* … */,
          },
        },
      },
      // (6) Also neutralize, in the existing MuiButton variants (themes.ts:270–288): text variant →
      // transparent at rest + alpha(text, 0.06) hover, text color textPrimary; outlined hover → alpha(text, 0.06)
      // bg + divider border. Same for MuiAutocomplete option selected (:208), MuiTableRow hover (:742),
      // MuiInputBase hover border (:499 → alpha(text, 0.2)), MuiListItemButton/MuiMenuItem below.
      MuiInputBase: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            // Input is not covered by theme.focusVisible; mirror the ring here (was 1px / 22%).
            '&.Mui-focused': { borderColor: c.ring ?? c.primaryMain, boxShadow: `0 0 0 3px ${ring}` },
            // …rest unchanged…
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm /* … */ } } },
      MuiTooltip: {
        defaultProps: { slots: { transition: Fade } },
        styleOverrides: { tooltip: { borderRadius: RADIUS.md, boxShadow: shadows[2], padding: '6px 10px' /* … */ } },
      },

      // (3)+(5) Floating surfaces: real shadow, larger radius, fade instead of Grow.
      MuiMenu: {
        defaultProps: { slots: { transition: Fade }, transitionDuration: { enter: 150, exit: 100 } },
        styleOverrides: {
          list: { padding: 4 }, // shadcn p-1
          paper: { borderRadius: RADIUS.lg, boxShadow: shadows[8] /* was 'none'; keep bg + border */ },
        },
      },
      MuiPopover: {
        defaultProps: { slots: { transition: Fade }, transitionDuration: { enter: 150, exit: 100 } },
        styleOverrides: { paper: { borderRadius: RADIUS.lg, boxShadow: shadows[8] } },
      },
      MuiAutocomplete: { styleOverrides: { paper: { borderRadius: RADIUS.lg, boxShadow: shadows[8] } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: RADIUS.xl, boxShadow: shadows[24] } } },
      MuiSnackbarContent: { styleOverrides: { root: { borderRadius: RADIUS.lg, boxShadow: shadows[6] } } },
      // Card / TableContainer / Paper.rounded: stay flat (mira uses ring-only cards), radius → RADIUS.lg.

      // (6) Neutral selection; menu rows 28px like mira/T3 desktop (min-h-7).
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.sm,
            fontSize: 13,
            minHeight: 28,
            paddingLeft: 8,
            paddingRight: 8,
            '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: selected },
            // Harness menus show a highlight, not a ring, on arrow keys. Drop the box-shadow ring;
            // the transparent outline stays, so forced-colors mode still gets an indicator.
            '&.Mui-focusVisible': { boxShadow: 'none' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            '&.Mui-selected': {
              backgroundColor: selected,
              color: c.textPrimary,
              '&:hover': { backgroundColor: alpha(c.textPrimary, 0.1) },
            },
          },
        },
      },
      // Keep MuiPaper.root.backgroundImage: 'none' (themes.ts:603): it suppresses the dark-mode
      // elevation overlay (Paper.mjs:101–108), which is driven by `elevation`, not by the shadows array.
    },
  });
};
```

Optional sixth ThemeId (`zinc`) with shadcn's zinc dark palette, converted to hex because `alpha()`/`darken()` throw on oklch (§3). Source: shadcn `themes.ts` zinc dark + Tailwind zinc ramp.

```ts
const ZINC_DARK_COLORS: ThemeColors = {
  ...ORIGINAL_COLORS, // status colors (error/info/success/warning) unchanged
  bgDefault: '#09090b', // zinc-950  (shadcn zinc dark --background)
  bgPaper: '#18181b', // zinc-900  (--card / --popover)
  divider: 'rgba(255, 255, 255, 0.10)', // --border oklch(1 0 0 / 10%)
  textPrimary: '#fafafa', // --foreground oklch(0.985 0 0)
  textSecondary: '#9f9fa9', // zinc-400  (--muted-foreground)
  textMuted: '#9f9fa9',
  ring: '#71717b', // zinc-500  (--ring)
  switchTrackOff: '#27272a', // zinc-800  (--muted / --accent)
  scrollbarThumb: '#3f3f46', // zinc-700
  scrollbarTrack: '#09090b',
  // Neutral primary like shadcn/Orca/OpenAI (zinc-200 on zinc-900). If links/selected
  // text must stay blue, keep ORIGINAL primary* and only swap surfaces (T3's choice).
  primaryMain: '#e4e4e7',
  primaryLight: '#fafafa',
  primaryDark: '#9f9fa9', // zinc-400
  primaryContained: '#e4e4e7',
  primaryContainedHover: '#d4d4d8',
  onAccent: '#18181b',
};
```

Adding it means `THEME_IDS` in `themeId.ts` grows and the theme picker gains an entry. Everything else flows through `createAppTheme`.

---

## 5. Gotchas and what MUI can't easily match

| #   | Issue                                                                                                                     | Impact / mitigation                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `disableRipple` without `focusVisible` removes the **only** keyboard focus indicator on ButtonBase components             | Ship them together (§4). Inputs need their own `.Mui-focused` ring: `focusVisible` doesn't cover InputBase.                                                                                                                                                            |
| 2   | `focusVisible.boxShadow` supports one layer only (docs). shadcn's `ring-offset` (background gap + ring) is two layers     | Use a single 3px ring (new-york look), or T3-style `outlineColor` + `boxShadow` (two-color ring, per docs). No exact `ring-offset` clone.                                                                                                                              |
| 3   | `shape.borderRadius` is an `sx` multiplier                                                                                | Don't bump it to 6–8 without auditing the 25 numeric `borderRadius` sites. Use `RADIUS` constants in overrides; for new `sx`, prefer `borderRadius: \`${RADIUS.md}px\``.                                                                                               |
| 4   | `typography.fontSize: 13` scales every internal `pxToRem` by 13/14                                                        | Components the theme doesn't override get slightly smaller than their MUI px defaults. Override in px where it matters, as the repo already does for Tooltip/Chip/Menu.                                                                                                |
| 5   | oklch tokens can't pass through `alpha()`/`darken()`                                                                      | Store hex (table §2.4), or move to `cssVariables` + `nativeColor` (larger change).                                                                                                                                                                                     |
| 6   | Pseudo-element "inner highlight" borders (T3 `before:shadow-[0_1px_white/16%]`, `inset-shadow`) and `active:scale-[0.97]` | Possible via `styleOverrides` (`'&::before'`, `'&:active': { transform: 'scale(0.97)' }`), but it's per component and fights MUI's own pseudo-elements on some (InputBase `::before/::after` underline in `Input`/`FilledInput`). Only do it on Button and IconButton. |
| 7   | Glass/backdrop surfaces (T3 `dropdown-glass`, Orca `bg-[rgba(255,255,255,0.78)] backdrop-blur`)                           | `backdropFilter` in `MuiMenu.paper`/`MuiPopover.paper` works, but needs a translucent `bgPaper`. Tauri/WebView2 and VS Code webview compositing cost are unverified. Optional.                                                                                         |
| 8   | Grow → Fade loses origin-aware motion. shadcn's `zoom-in-95` + `slide-in-from-top-2` has no stock MUI equivalent          | Custom transition component (a `Grow` fork with `scale(0.95)`) if Fade feels flat. Not worth it initially.                                                                                                                                                             |
| 9   | Checkbox/Radio use Material glyph SVGs (`CheckBoxOutlineBlank`, etc.)                                                     | `MuiCheckbox.defaultProps.{icon, checkedIcon, indeterminateIcon}` with custom 14–16px rounded-square SVGs. 8 call sites. Switch is already custom-sized (`themes.ts:650`).                                                                                             |
| 10  | TextField floating `label` + notched outline is the most recognizable Material input                                      | The repo already removes the notch. Don't use `label` on TextField (6 files use `<TextField>`); render a separate small label above (shadcn `Label` pattern).                                                                                                          |
| 11  | `@mui/icons-material` (Material Symbols) is the largest non-theme visual tell                                             | Out of theme scope. Inventory in [2026-10-21 §1 "@mui/icons-material (18 icons, 15 files)"](./2026-10-21-mui-to-shadcn-tailwind-radix.md#mui-icons-material-18-icons-15-files). Swapping to `lucide-react` (both harnesses) is independent of MUI and cheap.           |
| 12  | Menu/Popover `transitionDuration` default is `'auto'`, and Menu passes its own value to Popover                           | Set `transitionDuration` on **both** `MuiMenu` and `MuiPopover` `defaultProps` (§4).                                                                                                                                                                                   |
| 13  | Density guide says global `size="small"`/`dense` is "for demonstration only"                                              | The repo uses explicit heights instead. Keep that; don't flip `defaultProps.size` globally (call sites rely on `size="small"` being smaller than default).                                                                                                             |
| 14  | Claude's look (Styrene/Tiempos serif pairing, warm surfaces) needs licensed fonts and unverified colors                   | Don't chase it from secondary sources. A warm palette is just another `ThemeColors` entry if it's ever wanted.                                                                                                                                                         |

## Open questions

1. Primary: neutral (shadcn/Orca/OpenAI) or keep blue (T3)? This decides whether `zinc` overrides `primary*` or only surfaces.
2. Focus ring color: neutral gray (shadcn `--ring`) or primary (T3, OpenAI)?
3. Radius scale: T3's 4/6/8/12 (proposed, closer to today) or shadcn-site/Orca's 6/8/10/14?
4. Should `cssVariables` + `colorSchemes` replace whole-theme swapping in `AppThemeProvider`? It would also unlock `nativeColor` and oklch tokens.

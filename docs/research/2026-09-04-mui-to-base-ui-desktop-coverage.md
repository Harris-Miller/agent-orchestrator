# MUI → Base UI + Tailwind coverage for `apps/desktop`

Date: 2026-09-04
Question: If `apps/desktop` switched from MUI (`@mui/material`) to Base UI (`@base-ui/react`) + Tailwind CSS, which currently used MUI pieces lack Base UI equivalents, how hard are the named gaps given *this* app’s usage, and is Tailwind a sound pairing with Base UI?

## Summary

Base UI is an **unstyled, styling-agnostic** React component library. Its official catalog does **not** include Chip, circular progress, inline Alert, List/ListItem\*, or AppBar. Most interactive MUI widgets this app already uses (Button, Dialog, Menu, Select, Tabs, Accordion, Popover, linear Progress, Toast-class notifications) map cleanly.

For **this codebase’s actual usage**, Chip / circular determinate progress / Alert-in-Snackbar are **trivial** in-repo recreates (or Toast instead of Alert+Snackbar). List and AppBar look like “gaps” on a catalog matrix but are **presentational chrome** here — not hard product surface. The real migration cost is swapping interactive Base UI APIs and replacing `sx` / `ThemeProvider` with Tailwind, not rebuilding List/AppBar.

Tailwind + Base UI is an **officially documented** pairing (handbook demos use Tailwind v4 classNames on parts).

## Sources

Primary (Base UI):

- Catalog index: https://base-ui.com/llms.txt
- About (headless / Tailwind-compatible): https://base-ui.com/react/overview/about.md
- Styling handbook (Tailwind section): https://base-ui.com/react/handbook/styling.md
- Composition handbook: https://base-ui.com/react/handbook/composition.md
- Progress (linear track/indicator only): https://base-ui.com/react/components/progress.md
- Toast (notifications + `timeout`): https://base-ui.com/react/components/toast.md
- Alert Dialog (modal confirmation, not inline alert): https://base-ui.com/react/components/alert-dialog.md (listed in llms.txt)
- Toolbar (ARIA toolbar grouping — not MUI AppBar): https://base-ui.com/react/components/toolbar.md
- Separator: https://base-ui.com/react/components/separator.md

Primary (this repo):

- Deps: `apps/desktop/package.json` (`@mui/material`, `@mui/icons-material`, `@emotion/*`; **no** Tailwind / `@base-ui/react` today)
- Theme shell: `apps/desktop/src/App.tsx`, `apps/desktop/src/theme.ts`
- Gap usage sites under `apps/desktop/src/prototype/agentChat/` (cited per section)

Method: inventory every `@mui/material` / `@mui/icons-material` import under `apps/desktop/src`, map to the Base UI catalog from `llms.txt`, then re-read gap call sites.

## Inventory of MUI usage in `apps/desktop`

### Packages

| Package | Role today |
| --- | --- |
| `@mui/material` | Components + `ThemeProvider` / `createTheme` / `CssBaseline` |
| `@mui/icons-material` | Five icons in the directory picker only |
| `@emotion/react`, `@emotion/styled` | MUI styling runtime |

No Tailwind dependency in `apps/desktop/package.json` today.

### `@mui/material` components / APIs imported under `apps/desktop/src`

Unique import paths (source files only; excludes fixtures):

| Import | Files (representative) |
| --- | --- |
| Accordion, AccordionDetails, AccordionSummary | `RpcWireLogPanel.tsx` |
| Alert, Snackbar | `AgentChatPrototype.tsx` |
| AppBar, Toolbar | `AgentChatWorkbench.tsx` |
| Box | many |
| Button | many |
| Chip | `AgentChatWorkbench`, `BootstrapStatePanel`, `ChatItemView`, `SessionRosterPanel` |
| CircularProgress, LinearProgress | `UsageCard.tsx` |
| Container, CssBaseline, ThemeProvider (`@mui/material/styles`) | `App.tsx` |
| createTheme | `theme.ts` |
| Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle | `SessionRosterPanel.tsx` (+ Dialog in `CreateSessionDirectoryPicker.tsx`) |
| Divider | `BootstrapStatePanel`, `PanelHeader`, `SessionRosterPanel` |
| FormControl, InputLabel, Select, MenuItem | `SessionConfigOptionSelect.tsx` |
| IconButton | `UsageCard`, `PanelHeader`, `SessionRosterPanel`, `CreateSessionDirectoryPicker` |
| InputBase | `CreateSessionDirectoryPicker.tsx` |
| List, ListItem, ListItemButton, ListItemIcon, ListItemText, ListSubheader | chat / roster / bootstrap / directory picker |
| Menu, MenuItem | `CreateSessionDirectoryPicker.tsx` |
| Paper | many |
| Popover | `UsageCard.tsx` |
| Stack | many |
| Tab, Tabs | `RpcWireLogPanel.tsx` |
| Typography | many |

### `@mui/icons-material` (all in one file)

`CreateSessionDirectoryPicker.tsx`: `ArrowBack`, `FolderOutlined`, `KeyboardArrowDown`, `KeyboardArrowUp`, `SubdirectoryArrowLeft`.

Icons are out of Base UI’s scope (Base UI does not ship an icon set). Swap to any SVG icon package or inline SVGs independently of the MUI→Base UI component migration.

### Theme note

`theme.ts` also styles Autocomplete, Drawer, Switch, Table, Tooltip, etc. Those components are **not imported** by current desktop source. Migration work for styling is driven by **imported** components + the live dark palette / typography tokens, not every `Mui*` override key.

## Coverage matrix (MUI used here → Base UI)

Catalog of Base UI components from https://base-ui.com/llms.txt (Components section): Accordion, Alert Dialog, Autocomplete, Avatar, Button, Checkbox, Checkbox Group, Collapsible, Combobox, Context Menu, Dialog, Drawer, Field, Fieldset, Form, Input, Menu, Menubar, Meter, Navigation Menu, Number Field, OTP Field, Popover, Preview Card, Progress, Radio, Scroll Area, Select, Separator, Slider, Switch, Tabs, Toast, Toggle, Toggle Group, Toolbar, Tooltip.

| MUI (used in desktop) | Base UI / disposition |
| --- | --- |
| Accordion\* | **Covered** — Accordion |
| Button, IconButton | **Covered** — Button (icon buttons = Button + icon children) |
| Dialog\* | **Covered** — Dialog; destructive confirm can use **Alert Dialog** |
| Divider | **Covered** — Separator |
| FormControl / InputLabel | **Covered** — Field (labeling/validation) |
| InputBase | **Covered** — Input |
| LinearProgress | **Covered** — Progress (linear Track/Indicator) |
| Menu / MenuItem | **Covered** — Menu |
| Popover | **Covered** — Popover |
| Select / MenuItem (select) | **Covered** — Select |
| Tabs / Tab | **Covered** — Tabs |
| Snackbar | **Covered (behavior)** — Toast (`timeout` defaults to 5000ms; app uses 6000) |
| Alert (inline / snackbar body) | **Gap as component**; **behavior covered by Toast** for current use |
| Chip | **Gap** |
| CircularProgress | **Gap** (Progress is linear bar only) |
| List / ListItem / ListItemButton / ListItemIcon / ListItemText / ListSubheader | **Gap** (no List family) |
| AppBar | **Gap** |
| MUI `Toolbar` (inside AppBar) | **Not the same** as Base UI Toolbar (ARIA toolbar of controls). Treat AppBar chrome as layout, not a 1:1 Toolbar swap |
| Box, Stack, Container, Paper, Typography | **Intentional non-gaps** — layout/typography; Base UI is styling-agnostic |
| CssBaseline, ThemeProvider, createTheme | **Intentional non-gaps** — replace with CSS reset + Tailwind theme tokens / CSS variables |

Do **not** invent Base UI components outside the catalog above.

## Gap deep-dives (usage evidence)

### 1. Chip — easy recreate

**Catalog:** no Chip in https://base-ui.com/llms.txt.

**How this app uses Chip:**

- Status / backend / type labels: `size="small"`, usually `variant="outlined"`, optional `color` (`primary` / `success` / `warning` / `error` / `default`).
- Files: `BootstrapStatePanel.tsx` (many label chips), `SessionRosterPanel.tsx` (backend + status), `ChatItemView.tsx` (status / priority), `AgentChatWorkbench.tsx` (backend phase chips).
- One interactive case: phase chips in `AgentChatWorkbench.tsx` call `restartBackend` via `onClick` when `phase === 'error'` — still a compact labeled control, not MUI Chip’s delete/avatar/filter API surface.
- No `onDelete`, no avatar, no Chip-as-checkbox patterns found.

**Verdict:** A small presentational `<span>` / `<button>` with Tailwind variants covers all observed props. Theme already encodes Chip colors in `theme.ts` (`MuiChip`) — port those tokens, not the MUI component.

### 2. CircularProgress (determinate circular) — easy recreate; linear already covered

**Catalog:** Progress is documented as a **progress bar** with `Track` + `Indicator` (width-based). Demo and anatomy are linear only: https://base-ui.com/react/components/progress.md. No circular variant in the catalog.

**How this app uses it:**

- `UsageCard.tsx` → `UsagePopover`: one `CircularProgress` with `variant="determinate"`, `value={percent}`, `size={18}`, `enableTrackSlot`, decorative (`aria-hidden`) inside an `IconButton`.
- Same file’s `UsageCard` uses **`LinearProgress`** for the detailed bar — maps to Base UI `Progress`.

**Verdict:** Replace the 18px ring with a tiny SVG/`conic-gradient` indicator driven by the same percent. Do not expect Base UI Progress to draw a circle. Meter exists for numeric display but is not a circular progress widget and is unused conceptually here.

### 3. Inline Alert vs Snackbar — Toast replaces the pair

**Catalog:**

- No inline Alert component.
- **Alert Dialog** = modal that requires a response (listed in llms.txt) — wrong pattern for transient errors.
- **Toast** = notifications; `Toast.Provider` + manager; per-toast / provider `timeout` (default **5000** ms per Toast API).

**How this app uses Alert:**

Only in `AgentChatPrototype.tsx`: `Snackbar` (`autoHideDuration={6000}`, bottom-center) wrapping `Alert` (`severity="error"`, `variant="filled"`, dismiss `onClose`) for `clientError` strings.

**Verdict:** No separate inline Alert component is required for current product behavior. Use Base UI Toast (title/description or description-only, `timeout: 6000`, close control). An in-repo “Alert” strip would only be needed if a future screen shows persistent non-toast banners — none today.

Destructive **session delete** already uses MUI Dialog confirm in `SessionRosterPanel.tsx` — that maps to Base UI Dialog / Alert Dialog, not Toast and not inline Alert.

### 4. List family — presentational; not hard here

**Catalog:** no List / ListItem\* / ListSubheader.

**How this app uses List:**

| Site | Pattern |
| --- | --- |
| `AgentChatMain.tsx` + `ChatItemView.tsx` | Scrollable message feed: `List` + `ListItem` / `ListItemText` as layout wrappers around custom message UI |
| `BootstrapStatePanel.tsx` | Dense command list: primary/secondary text rows |
| `SessionRosterPanel.tsx` | Grouped roster: `List` + nested `<ul>`, `ListSubheader` for cwd, `ListItem` + `ListItemButton` for selection chrome around a `Paper` card |
| `CreateSessionDirectoryPicker.tsx` | `List` + `ListItemButton` / Icon / Text for directory rows |

**Keyboard / a11y ownership:** Directory picker implements its **own** `onKeyDown` (ArrowUp/Down, Enter, Escape, etc.) on the Dialog — it does not rely on MUI List’s listbox keyboard model (`CreateSessionDirectoryPicker.tsx`). Roster/chat lists are click-to-select / static rows.

**Verdict:** Replace with semantic HTML (`ul`/`li`/`button`) + Tailwind. Optional Base UI pieces nearby (Dialog, Menu, Button) stay for real interaction. Rebuilding MUI List’s full accessibility matrix is unnecessary given observed usage.

### 5. AppBar — static header; not hard here

**Catalog:** no AppBar. Base UI **Toolbar** is a control-grouping pattern with toolbar semantics (demo groups toggles/selects): https://base-ui.com/react/components/toolbar.md — not a page AppBar substitute.

**How this app uses AppBar:**

Single site: `AgentChatWorkbench.tsx` — `AppBar position="static"` wrapping MUI `Toolbar` with title typography, optional Sessions / Session state buttons, and phase Chips. Not sticky/fixed, not color-scroll, not mobile drawer pairing.

Theme paints AppBar via `MuiAppBar` / `MuiToolbar` in `theme.ts` (dark bar, minHeight 60).

**Verdict:** A `header` + flex row with Tailwind (or optionally Base UI Toolbar *if* you want toolbar keyboard semantics for the button group) replaces it. Difficulty is visual token port, not behavior.

## Migration difficulty reassessment

| Work item | Difficulty for *this* app | Why |
| --- | --- | --- |
| Chip | Easy | Labels + colors + one onClick |
| Circular determinate indicator | Easy | One 18px decorative ring |
| Alert + Snackbar | Easy / delete Alert | Toast covers the only call site |
| List\* / ListSubheader | Easy–moderate | Markup + styles; picker already owns keys |
| AppBar + MUI Toolbar layout | Easy | One static header |
| Interactive Base UI swaps (Dialog, Menu, Select, Tabs, Accordion, Popover, Progress, Button, Field) | **Main cost** | API/composition/`render` prop differences |
| `sx` + `ThemeProvider` → Tailwind tokens | **Main cost** | Widespread layout; large `theme.ts` palette/typography |
| Icons | Easy, separate | Five icons; pick any SVG source |

**Harder work is not rebuilding List/AppBar.** It is adopting Base UI part composition (see composition handbook) and replacing Emotion/`sx` with utility classes while preserving the existing dark UI tokens.

## Is Tailwind + Base UI a sound pairing?

**Yes, by primary docs:**

- About: components are unstyled, “compatible with Tailwind, CSS Modules, plain CSS, CSS-in-JS…” (https://base-ui.com/react/overview/about.md).
- Styling handbook has a dedicated **Tailwind CSS** section: apply classes via `className` on each part; examples use Tailwind utility strings and `data-*` state selectors (https://base-ui.com/react/handbook/styling.md).
- `llms.txt` states Tailwind examples target **Tailwind CSS v4** (convert if staying on v3).

Caveats for this repo (not blockers):

- Desktop has **no Tailwind today** — greenfield CSS toolchain + token mapping from `theme.ts`.
- Prefer `className` / data attributes over wrapping every part in Emotion if leaving MUI; Base UI also supports CSS-in-JS if a phased hybrid is desired.
- Base UI `Toolbar` ≠ MUI AppBar; do not force Toolbar where a plain header is enough.

## Conclusion

1. **True catalog gaps** among components this app uses: **Chip**, **circular Progress**, **inline Alert**, **List family**, **AppBar**. Layout/theme primitives (Box, Stack, Container, Paper, Typography, CssBaseline, ThemeProvider) are expected non-gaps for a headless library.
2. Against **actual** desktop usage, Chip / circular progress / Alert are **trivial**; Alert may be **unnecessary** if Toast replaces Snackbar+Alert. List and AppBar are **not hard** — presentational rows and one static header; directory picker already owns keyboard logic.
3. **Tailwind + Base UI is officially supported** and a sound styling pairing; expect most effort on interactive remounts + Tailwind token migration, not on filling the five catalog gaps.

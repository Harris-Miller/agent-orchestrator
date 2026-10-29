# Orca vs T3 Code: workspace / right-panel file-tree explorer

Date: 2026-10-29  
Question: How do the local OSS checkouts of **orca** and **t3code** implement their workspace / right-panel **file-tree explorer** UIs (Files panel, Find/Search files, tree chrome), and what is actionable for agent-orchestrator GitHub issue **#169** (Right-panel workspace file-tree explorer)?

Primary sources (read in tree, not blogs):

- `/Users/harris/Projects/github_oss_projects/orca`
- `/Users/harris/Projects/github_oss_projects/t3code`

Issue #169 first-cut wants: hierarchical cwd-scoped tree, expand/collapse, name filter (not Contents), file-type icons, header chrome (cwd title + close; optional refresh/collapse-all), always-hidden globs + exclude `.git`, reuse existing FS listing. Out of scope: Names/Contents mode, preview pane, multi-tab/sort/in-panel editors, click-to-open viewer.

## Summary

| Surface | Orca | T3 Code | #169 first cut |
| --- | --- | --- | --- |
| Panel shell | Right-sidebar **explorer** tab (`FileExplorer`); close lives on activity bar | Right-panel **Files** tab wraps `FilePreviewPanel` + optional tree (`FileBrowserPanel`) | Desktop right panel; keep close; no multi-tab Files chrome |
| Tree UI | Custom virtualized rows (`FileExplorerVirtualRows` / `FileExplorerRow`) | `@pierre/trees` `FileTree` + `useFileTree` | Build or thin custom tree; do not require Pierre |
| Name filter | “Find files” (Names mode); host listing + client token match | “Search files”; server `projects.searchEntries` via FileFinder | Name filter only; prefer client filter over recursive listing |
| Contents / full-text | Separate **Contents** toggle + `files.search` | Separate content search APIs (`searchContents`); not tree chrome | **Out of scope** |
| Listing | Lazy per-dir `files.readDir` / `fs:readDir` | Lazy per-dir `projects.listEntries` (`NodeFSP.readdir`) | Reuse `sessionFsListing` / `listRecursiveEntries` (fd) — different stack |
| Always hide | Hard-filters `.git` + `node_modules` at entry map; dotfiles toggle | Hard-skips `.git` children; still lists gitignored (marked `ignored`) | Always-hidden globs + always `.git` (settings) |
| Icons | Lucide via `FileTypeIcon` / extension+name tables | Pierre builtins + T3 sprite overrides (`pierre-icons.ts`) | Reuse theme file-chip icon packs |
| Preview / open | Click opens workspace editor preview; drag/rename/delete full IDE | Click opens file in Files preview; drag → composer mention | Mention insert OK; **no** viewer |
| Watch / refresh | FS watch reconcile + manual Refresh | Manual refresh + workspace mutation refresh hook | Refresh on cwd change; optional manual refresh |

---

## Method

Grep/read both trees for file-explorer / FileBrowser / Find files / Search files / listEntries / readDir / name filter / ignore / `.git`. Claims cite concrete paths (line ranges when quoting behavior). Peer issue wording that claimed T3 “sort chrome” was checked against current `FileBrowserPanel` source — **no sort menu** in that panel (refresh + expand/collapse only).

---

## Orca

### UI surface

**Coordinator:** `src/renderer/src/components/right-sidebar/FileExplorer.tsx` — mounts toolbar, Names/Contents query strip, tree pane, and Contents results.

**Shell / close:** Explorer is the `explorer` right-sidebar tab, lazy-loaded from `right-sidebar-panel-content.tsx`. Close control is on the shared activity bar (`right-sidebar-top-activity-bar.tsx` `closeButton` prop), not inside `FileExplorerToolbar`.

**Header chrome (`FileExplorerToolbar.tsx`):**

- Title: repo / workspace display name (`repoName`)
- Collapse All (`ListCollapse`)
- Refresh Explorer (`RefreshCw` / spinner)
- Overflow: Show Dotfiles, optional Show Git Ignored Files, “Open in …” menu items

```57:135:/Users/harris/Projects/github_oss_projects/orca/src/renderer/src/components/right-sidebar/FileExplorerToolbar.tsx
    <div className="flex h-8 min-h-8 items-center gap-2 border-b border-border px-2">
      <span
        className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
        title={repoName}
      >
        {repoName}
      </span>
      ...
            aria-label={translate(
              'auto.components.right.sidebar.FileExplorerToolbar.6026b16950',
              'Collapse All'
            )}
      ...
            aria-label={translate(
              'auto.components.right.sidebar.FileExplorerToolbar.d95e30fe28',
              'Refresh Explorer'
            )}
```

**Names / Contents toggle:** `FileExplorerViewSwitch` — labels **Names** vs **Contents**. Wired under the query field by `FileExplorerQueryStrip`.

```24:43:/Users/harris/Projects/github_oss_projects/orca/src/renderer/src/components/right-sidebar/FileExplorerViewSwitch.tsx
  const options: ExplorerViewOption[] = [
    {
      view: 'files',
      label: translate('auto.components.right.sidebar.FileExplorerViewSwitch.c4e9a2b713', 'Names'),
      ...
    },
    {
      view: 'search',
      label: translate(
        'auto.components.right.sidebar.FileExplorerNameFilter.7a9fb1e6aa',
        'Contents'
      ),
```

**Name filter UI:** `FileExplorerNameFilter` — placeholder / aria **“Find files”** (or “Find in {{path}}” when display root scoped).

```30:40:/Users/harris/Projects/github_oss_projects/orca/src/renderer/src/components/right-sidebar/FileExplorerNameFilter.tsx
        aria-label={translate(
          'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
          'Find files'
        )}
        placeholder={
          scopeLabel
            ? translate('fileExplorer.root.findInFolder', 'Find in {{path}}', { path: scopeLabel })
            : translate(
                'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
                'Find files'
              )
        }
```

**Tree node rendering:** `FileExplorerRow.tsx`

- Folders: `ChevronRight` rotate + Lucide `Folder` / `FolderOpen` (loading `Loader2`, error `CircleAlert`)
- Files: `FileTypeIcon` from path; symlinks use Lucide `Link`
- Indent by `depth * 16`
- Ignored paths: italic + `--git-decoration-ignored` color

Icons map through Lucide tables (`lib/file-type-icons.ts` → `file-type-icon-extension-table` / `file-type-icon-name-table`), not a VS Code icon theme pack.

**Empty / loading / error:** `FileExplorerTreeStatus` — spinner, “Could not load files…”, “No files in this workspace”, WSL-hosts-off CTA. No-worktree empty copy in `FileExplorer.tsx` (“Select a workspace to browse files”).

**Click / selection / drag:**

- Click: `useFileExplorerHandlers` → `activateFileExplorerNode` (toggle dir / open file via `openWorkspaceFile`)
- Double-click file: `makePreviewFilePermanent` (pins preview editor tab)
- Full drag-move, OS drop, rename, delete, context menus, undo/redo — large IDE surface beyond #169
- Contents mode: `SearchResultsPane` + `useFileSearchPanel` → `files.search` RPC (full-text) — **#169 out of scope**

### Data / FS listing

**Browse (expand):** Lazy. `useFileExplorerTree` caches per absolute dir; `loadDir` calls `readFileExplorerDirectory` → `readRuntimeDirectory` → host `files.readDir` / IPC `fs:readDir`. Children mapped through `shouldIncludeFileExplorerEntry`.

```4:6:/Users/harris/Projects/github_oss_projects/orca/src/renderer/src/components/right-sidebar/file-explorer-entries.ts
export function shouldIncludeFileExplorerEntry(entry: DirEntry): boolean {
  return entry.name !== '.git' && entry.name !== 'node_modules'
}
```

Root scoping: active **worktree path**, with optional **display root** (sparse / folder scope) via `file-explorer-display-root` helpers — operations still keyed to the real worktree root.

**Name filter data path (not the same as lazy browse):**

1. `useFileExplorerNameFilter` enables `useRuntimeFileListForWorktree` when query non-empty → host `files.listAll` (ripgrep-based quick-open inventory in `filesystem-list-files.ts`)
2. Renderer projects flat relative paths into a synthetic tree: `createNameFilteredFileExplorerProjection`
3. Match: whitespace-split tokens, **case-insensitive substring on full relative path** (`pathMatchesFileNameFilterTokens` in `shared/file-name-filter-tokens.ts`)

```51:60:/Users/harris/Projects/github_oss_projects/orca/src/shared/file-name-filter-tokens.ts
export function pathMatchesFileNameFilterTokens(
  relativePath: string,
  tokens: readonly string[]
): boolean {
  if (tokens.length === 0) {
    return true
  }
  const haystack = relativePath.toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}
```

**Hidden / ignore:**

| Rule | Behavior |
| --- | --- |
| `.git`, `node_modules` | Always omitted from tree mapping |
| Dotfiles | Toggle per worktree (`showDotfiles`); filter uses `isDotfileRelativePath` |
| Gitignored | Queried via `getRuntimeGitIgnoredPaths`; default **shown** (`showGitIgnoredFiles ?? true`); toggle in toolbar overflow; italic when shown |

This is **not** the same model as agent-orchestrator “Always-hidden globs” settings — Orca hardcodes two basenames and separately toggles dots / gitignore.

**Refresh / watch:** Manual `useFileExplorerManualRefresh` → `tree.refreshTree`. Disk changes: `useFileExplorerWatch` + `file-explorer-watch-reconcile` / scheduler listening to FS / worktree change events. Scope transition hooks reset selection when display root changes.

### Architecture seams worth stealing for #169

**Steal-shaped:**

1. **Split chrome:** toolbar (title + refresh + collapse) vs query strip vs tree pane (`FileExplorerToolbar` / `FileExplorerQueryStrip` / `FileExplorerFilesTreePane`).
2. **Flat listing → hierarchical projection for filter:** `createNameFilteredFileExplorerProjection` builds ancestor directories from matched relative paths and honors collapse sets — closest analogue to filtering a recursive `sessionFsListing`.
3. **Shared token matcher** (`file-name-filter-tokens.ts`) so host and UI agree.
4. **Status vs empty** (`FileExplorerTreeStatus`) — distinguish load failure from empty cwd.

**Deliberately do not copy (cite to know the boundary):**

| Feature | Where it lives |
| --- | --- |
| Names / Contents toggle + content search | `FileExplorerViewSwitch.tsx`, `useFileSearchPanel.ts`, `SearchResultsPane.tsx`, RPC `files.search` |
| Editor preview open / pin | `useFileExplorerHandlers.ts` (`openWorkspaceFile`, `makePreviewFilePermanent`) |
| Rename / delete / undo / multi-drag | `FileExplorerRow`, `fileExplorerUndoRedo`, drag hooks |
| Per-dir lazy cache + FS watch machinery | `useFileExplorerTree.ts`, `useFileExplorerWatch.ts` (only needed if not using recursive fd listing) |
| Hardcoded `node_modules` hide | `file-explorer-entries.ts` — #169 should use Always-hidden globs instead |

---

## T3 Code

### UI surface

**Tree panel:** `apps/web/src/components/files/FileBrowserPanel.tsx` — default export used inside `FilePreviewPanel` when the explorer pane is shown.

**Files shell:** Right panel multi-tab chrome (`RightPanelTabs.tsx` — “Files” tab) → `RightPanelSurfaceContent.tsx` → lazy `FilePreviewPanel`. Tree sits beside / under preview via `FileExplorerPane` (width storage `t3code.fileExplorerWidth`). **Multi-tab + in-panel editors / previews are #169 out of scope.**

**Header chrome inside `FileBrowserPanel` (subheader row):**

- Refresh (`RefreshFilesButton` — “Refresh workspace files” / “Refresh files”)
- Search field placeholder **“Search files”**
- Expand all / Collapse all folders (`ChevronsUpDown` / `ChevronsDownUp`) when directories exist and not `hostFolder`
- **No sort menu** in this panel (issue peer note overstated current chrome)

```486:524:/Users/harris/Projects/github_oss_projects/t3code/apps/web/src/components/files/FileBrowserPanel.tsx
      <div
        className="flex h-10 min-h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2 ..."
        data-surface-subheader
      >
        <RefreshFilesButton isPending={isPending} onRefresh={handleRefresh} />
        <FileSearchField
          name="project-files-search"
          ariaLabel={`Search ${projectName} files`}
          value={search.value}
          onValueChange={handleSearchValueChange}
          onClose={closeSearch}
        />
        {directoryPaths.length > 0 && !hostFolder ? (
          ...
                  aria-label={
                    expandAll || allDirectoriesExpanded
                      ? "Collapse all folders"
                      : "Expand all folders"
                  }
```

Close of the whole right panel is outside this component (panel tab chrome), not a local X on the tree header. Project name appears in aria-labels; the visible subheader is refresh + search + expand, not a large title string like Orca’s toolbar.

**Tree rendering:** Pierre `FileTree` + `useFileTree`:

- `icons: T3_PIERRE_ICONS` (`apps/web/src/pierre-icons.ts`) — Pierre builtin sprite + T3 custom symbols (pdf/office/video/agents/pnpm/…)
- `fileTreeSearchMode: "hide-non-matches"`, `flattenEmptyDirectories: true`, `initialExpansion: "closed"`
- Loading decoration on expanded dirs via `renderRowDecoration` → `t3-tree-icon-loading`
- Gitignored styling via `model.setGitStatus(... status: "ignored")`

**Empty / loading / error:**

- Error button: `{error} Click to retry.`
- Truncation banner when search truncated
- “Loading files…” (visible or `sr-only` if rows already present)
- “No matching files.” when search open with zero matches

**Click / selection / drag:**

- Selecting a **file** calls `onOpenFile` → opens in Files **preview / editor** surface (`FilePreviewPanel`) — **#169 out of scope**
- Context menu: reveal, copy mention, add to chat, open-with, etc.
- Drag: `createFileTreeDragMentionController` tags drags for composer mention insert (`canDrop: () => false` — no in-tree move)
- Expand-all skips `ignored` directories (still expandable by hand)

### Data / FS listing

**Browse (expand):** Lazy. `useDirectoryEntries` keeps a `Map` of directoryPath → children; concurrency capped at 4. Each load:

```28:28:/Users/harris/Projects/github_oss_projects/t3code/apps/web/src/components/files/useDirectoryEntries.ts
    const atom = projectEnvironment.listEntries({ environmentId, input: { cwd, directoryPath } });
```

Server `WorkspaceEntries.list` with `directoryPath` set uses **`node:fs/promises` `readdir`**, refuses paths under `.git`, skips child named `.git`, then marks gitignored via `git check-ignore -z --stdin`:

```315:328:/Users/harris/Projects/github_oss_projects/t3code/apps/server/src/workspace/WorkspaceEntries.ts
              relative.split(path.sep).includes(".git") ||
              target.relativePath.split("/").includes(".git")
            ) {
              throw new Error("Directory must be inside the workspace and outside .git.");
            }
            const children = await NodeFSP.readdir(directory, { withFileTypes: true });
            return {
              entries: children.flatMap((child): ProjectEntry[] => {
                if (child.name === ".git" || (!child.isDirectory() && !child.isFile())) return [];
                return [
                  {
                    path: target.relativePath ? `${target.relativePath}/${child.name}` : child.name,
                    kind: child.isDirectory() ? "directory" : "file",
                  },
```

Root scoping: project **`cwd`** (or host-folder absolute path when browsing outside project). `hostFolder` disables expand-all and limits search to loaded folders.

**Name / path search:**

- UI query debounced → `useProjectPathSearch` → `projectEnvironment.searchEntries`
- Backed by `WorkspaceSearchIndex` + native **`@ff-labs/fff-node` `FileFinder`** (not `fd`, not client-only filter of the lazy tree)
- `buildTreeEntries` merges directory listing + search hits and synthesizes missing ancestor directories (same “flat hits → tree” idea as Orca’s name-filter projection)

```106:121:/Users/harris/Projects/github_oss_projects/t3code/apps/web/src/components/files/FileBrowserPanel.tsx
function buildTreeEntries(
  directoryEntries: readonly ProjectEntry[],
  searchEntries: readonly ProjectEntry[],
  searchPending: boolean,
  query: string,
) {
  const result = new Map(directoryEntries.map((entry) => [entry.path, entry]));
  if (query.trim() && !searchPending) {
    for (const entry of searchEntries) {
      if (!result.has(entry.path)) result.set(entry.path, entry);
      const segments = entry.path.split("/");
      for (let index = 1; index < segments.length; index++) {
        const path = segments.slice(0, index).join("/");
        if (!result.has(path)) result.set(path, { path, kind: "directory" });
      }
    }
  }
```

Pierre’s client search (`useFileTreeSearch`) is also wired; empty Pierre matches show “No matching files.” Server search supplies entries for deep matches not yet expanded in the lazy tree.

**Hidden / ignore:**

| Rule | Behavior |
| --- | --- |
| `.git` | Never listed as a child; cannot list inside `.git` |
| Gitignored | Still listed; `ignored: true` + Pierre ignored status (dimmed) |
| Dotfiles | Listed (no Orca-style show-dotfiles toggle in this panel) |
| Always-hidden globs | Not the agent-orchestrator settings concept |

**Refresh / invalidation:**

- Manual refresh reloads loaded directories + refreshes path search
- `useWorkspaceMutationRefresh` on `workspaceMutationId` / `files:${environmentId}:${cwd}`
- Environment session generation remount retries failed folder reads
- No Orca-style live FS watch reconcile in this panel path (mutation/refresh driven)

Separate **content** search: `useProjectContentSearch` / `WorkspaceEntries.searchContents` — parallel to Orca Contents; not the tree filter.

### Architecture seams worth stealing for #169

**Steal-shaped:**

1. **`buildTreeEntries`-style merge:** given a flat match set, inject ancestor directories so a hierarchical tree can expand to hits without a second invent-a-stack.
2. **Lazy expand + “expand all skips ignored”** if a future cut moves off recursive listing — optional; #169 prefers existing recursive fd listing.
3. **Composer mention on drag / context** (`fileTreeDragMention.ts`) aligns with #169 “mention path where practical.”
4. **Clear loading / empty / truncated / error copy** in one panel.

**Deliberately do not copy:**

| Feature | Where it lives |
| --- | --- |
| Preview pane + in-panel editors | `FilePreviewPanel.tsx`, office/pdf/markdown viewers under `components/files/` |
| Multi-tab Files chrome | `RightPanelTabs.tsx`, `RightPanelSurfaceContent.tsx` |
| Pierre dependency / shadow DOM tree | `FileBrowserPanel.tsx` `@pierre/trees` |
| Server FileFinder index for name search | `WorkspaceSearchIndex.ts`, `useProjectPathSearch` — #169 should filter recursive listing client-side |
| Content search | `useProjectContentSearch`, `WorkspaceEntries.searchContents` |
| Sort menus | **Not present** on current Files tree chrome (do not invent to “match” T3) |

---

## Comparison relevant to #169

| Concern | Orca | T3 | #169 ask |
| --- | --- | --- | --- |
| Hierarchical expand/collapse | Yes (lazy + virtualized) | Yes (Pierre + lazy) | Yes |
| Name filter | “Find files”; host listAll + client tokens on path | “Search files”; FileFinder server search + Pierre hide-non-matches | Name filter; reuse `sessionFsListing` → prefer **client filter of recursive entries**, closest to Orca projection / T3 `buildTreeEntries` |
| Contents / full-text | First-class toggle | Separate APIs, not tree toggle | **Out** |
| Icons | Lucide `FileTypeIcon` | Pierre + T3 sprites | Reuse agent-orchestrator file-chip / theme packs |
| Header | Title + collapse + refresh + overflow | Refresh + search + expand/collapse | Title + close; optional refresh/collapse |
| Close | Activity bar | Panel tab chrome | Keep existing panel close |
| Exclude `.git` | Entry filter | Entry filter | Always |
| Always-hidden globs | No (hardcoded `.git`/`node_modules` + toggles) | No (`.git` + gitignore markers) | Yes — same as `@` mentions / directory picker (`fdListing.ts` / Always-hidden settings) |
| Listing stack | readDir + rg listAll | readdir + FileFinder | **`sessionFsListing` / `listRecursiveEntries` (fd)** — do not invent second stack |
| Preview / open file | Editor preview | Files preview panel | **Out**; mention insert OK |
| Multi-tab / sort / in-panel editor | N/A for explorer tab; heavy mutation | Files tabs + preview editors; no sort on tree | **Out** |
| Watch | Yes | Mutation refresh | Cwd change refresh required; live watch optional |

### Sharpest takeaways for implementers

1. **#169 is closer to “project recursive listing into a tree + filter” than to either product’s full Files IDE.** Both peers layer preview, mutation, and search indexes that the ticket explicitly excludes.
2. **Best steal from Orca:** toolbar/query/tree split + `createNameFilteredFileExplorerProjection` (flat relative paths → expandable synthetic tree + token path match).
3. **Best steal from T3:** `buildTreeEntries` ancestor injection + mention-oriented click/drag; keep Pierre/FileFinder/preview out.
4. **Ignore peer chrome you do not need:** Names/Contents (Orca), Files multi-tab + preview (T3), inventing a sort menu “because the issue said T3 has sort” (current tree has none).
5. **Ignore rules differ:** map Orca/T3 `.git` exclusion onto agent-orchestrator’s `fdExcludeArgs` / Always-hidden globs; do not hardcode only `node_modules` unless settings say so.
6. **Existing AO seam:** `libs/ui/src/atoms/sessionFsListing.atoms.ts` + `libs/ui/src/host/fdListing.ts` already recursive-list with `-E .git` and Always-hidden globs — wire the panel to that, then hierarchicalize + filter in UI.

---

## Gaps / not fully traced

- Orca main-process `readFileExplorerDir` implementation body (RPC entry at `files.ts` / IPC `fs:readDir` confirmed; provider internals not line-walked in full).
- Exact FileFinder ignore semantics inside `@ff-labs/fff-node` (native package; T3 only configures `FileFinder.create({ basePath, … })`).
- Full Orca Contents search UI (`SearchQueryRow` / `SearchFilters`) — confirmed out of #169; not deep-documented.
- T3 mobile file tree (`apps/mobile/.../useFileTreeEntries.ts`) — parallel pattern, not the desktop right-panel peer for #169.
- Codex peer from the issue was not in scope for this note (Orca + T3 only).

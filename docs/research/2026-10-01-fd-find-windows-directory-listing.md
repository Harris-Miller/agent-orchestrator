# CLI directory listing: `fd`, macOS `find`, and Windows options

Date: 2026-10-01  
Question: For issue #102 (`@`-triggered file/dir picker) and for replacing the slow Effect `FileSystem.readDirectory` + per-entry `stat` path in `CreateSessionDirectoryPicker` / `sessionDirectoryBrowser.ts`, what CLI tools and spawn model should this Tauri + Effect desktop app use on **macOS (primary)** and **Windows (required)** — preferring `fd`, with honest fallbacks?

Scope: shallow depth-1 listing (cwd picker) and full recursive listing (fzf-style filter). Linux not required. Commands run with `cwd` = session cwd.

## Recommendations summary (ponytail)

1. **Prefer `fd` on both macOS and Windows** — one flag matrix, files _and_ directories, hidden + gitignore knobs, depth limit, null-delimited output. Officially cross-platform Rust binary (`fd.exe` on Windows).
2. **Spawn the executable directly** via existing `ChildProcess.make('fd', args, { cwd })` → Tauri `Command.create` — **no shell**, so not locked into `cmd.exe` / PowerShell. (Effect _can_ set `shell: true` → `cmd.exe` on Windows, but this app’s Tauri Live never passes `shell`.)
3. **macOS backup when `fd` missing:** stock BSD `find` for type/depth/hidden-by-name; **no** `.gitignore` parity. For gitignore-aware file lists inside a repo, use `git ls-files` (not `find`).
4. **Windows backup when `fd` missing:** `dir /s /b` (cmd) or `Get-ChildItem` (PowerShell) for crude recursion — **no** gitignore. Optional: `rg --files` (files only, respects gitignore) or `git ls-files` in a repo. Do **not** chase WSL or Everything Search for this product path.
5. **Ship/document `fd` as the supported path**; OS fallbacks are degraded and platform-specific. Also: Tauri shell capabilities today allow only `bun`/`claude`/`codex`/`gemini`/`node` — spawning `fd`/`find`/`git` needs capability entries (or a sidecar).

---

## 0. Repo context: current listing + spawn

### Current slow path

`listChildDirectories` does `FileSystem.readDirectory` then per-name `stat` to keep directories only:

- [`apps/desktop/src/acp/sessionDirectoryBrowser.ts`](../../apps/desktop/src/acp/sessionDirectoryBrowser.ts) (`listChildDirectories`)
- Consumed by create-session UI under `apps/desktop/src/components/workbenchNavRail/CreateSessionDirectoryPicker.tsx`

### How this app spawns processes

| Layer        | API                                                                                                                              | Shell?                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Call sites   | `ChildProcess.make(cmd, args, options)` from `effect/unstable/process`                                                           | Optional `options.shell`; **call sites inspected do not set it**                                                                       |
| Desktop Live | [`libs/context-services-tauri/src/ChildProcessSpawnerLive.ts`](../../libs/context-services-tauri/src/ChildProcessSpawnerLive.ts) | Bridges to `@tauri-apps/plugin-shell` `Command.create(command, args, { cwd, encoding: 'raw', env? })` — **no `shell` field forwarded** |
| Tauri plugin | [`@tauri-apps/plugin-shell` `Command.create`](https://v2.tauri.app/plugin/shell/)                                                | Spawns the named program with args (scoped by capabilities)                                                                            |
| Capabilities | [`apps/desktop/src-tauri/capabilities/default.json`](../../apps/desktop/src-tauri/capabilities/default.json)                     | `shell:allow-execute` / `shell:allow-spawn` allow only `bun`, `claude`, `codex`, `gemini`, `node` today                                |

Example call sites (direct executable names, no shell):

- `libs/ui/src/host/vendorCliAuth.ts` — `ChildProcess.make('codex' | 'claude', …)`
- `libs/ui/src/host/acpAdapterCommand.ts` — `ChildProcess.make('node', [entry], …)`
- `libs/ui/src/host/backendHarness.ts` — `ChildProcess.make('gemini', ['--acp'], …)`

Effect documents `CommandOptions.shell`:

> If set to `true`, runs the command inside of a shell, defaulting to `/bin/sh` on UNIX systems and `cmd.exe` on Windows. … Can also be set to a string representing the absolute path to a shell … It is generally disadvised to use this option.

Source: `node_modules/.pnpm/effect@4.0.0-rc.112/node_modules/effect/src/unstable/process/ChildProcess.ts` (`CommandOptions.shell`).

**Verdict:** This app is **not** locked into `cmd.exe`. Default path = spawn executable by name. PowerShell only if you explicitly run `powershell.exe` / `pwsh.exe` (or set `shell` to that path). Node’s own docs: `shell: true` uses `process.env.ComSpec` on Windows with `'cmd.exe'` fallback ([Node.js `child_process`](https://nodejs.org/api/child_process.html) — “Default Windows shell”).

---

## 1. `fd` (sharkdp/fd)

Primary sources: [sharkdp/fd README](https://github.com/sharkdp/fd/blob/master/README.md), local `man fd` / `fd --help`, [releases](https://github.com/sharkdp/fd/releases).

### Defaults

| Behavior                                 | Default                                      | Override                                                                   |
| ---------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| Hidden files/dirs (name starts with `.`) | **Skipped**                                  | `-H` / `--hidden` (override with `--no-hidden`)                            |
| Ignore files                             | **Honored**                                  | `-I` / `--no-ignore` (or `-u` / `--unrestricted` = `--hidden --no-ignore`) |
| Paths printed                            | **Relative** to search root (cwd if omitted) | `-a` / `--absolute-path`                                                   |
| Record separator                         | Newline                                      | `-0` / `--print0` (NUL)                                                    |
| Depth                                    | Unlimited                                    | `-d` / `--max-depth <n>`                                                   |
| Type                                     | All matching entries                         | `-t` / `--type` (`f`/`file`, `d`/`dir`/`directory`, …)                     |

### Ignore sources (official)

From `man fd` (`--no-ignore` / `--no-ignore-vcs`):

- `.gitignore`
- `.git/info/exclude`
- Global gitignore (`core.excludesFile`, default `$HOME/.config/git/ignore`)
- `.ignore`
- `.fdignore`
- Global fd ignore (`$HOME/.config/fd/ignore` on macOS/Linux; `%APPDATA%\fd\ignore` on Windows — README)

Also:

- `--no-ignore-vcs` — disable _only_ gitignore / git exclude / global gitignore (keep `.ignore` / `.fdignore` / global fd ignore)
- `--no-ignore-parent` — ignore parent-dir ignore files
- By default, gitignore rules apply only when searching inside a detected git repo (`--no-require-git` relaxes that)

README also: `.ignore` shared with `rg`/`ag`; permanent excludes via `.fdignore` or global ignore file.

### Type / depth / output

- **Dirs only:** `fd -t d` or `fd --type directory`
- **Files only:** `fd -t f` or `fd --type file`
- **Shallow (cwd children):** `fd -d 1` / `fd --max-depth 1` (verified locally: lists immediate entries only; dirs may print with trailing `/` depending on version/settings)
- **NUL-delimited:** `fd -0` / `fd --print0`
- Pattern: omit pattern (list all) or use `.` / `^` as catch-all when a path is also given (README)

### Windows availability

Official README “On Windows”:

- Pre-built binaries from [releases](https://github.com/sharkdp/fd/releases) (e.g. `fd-v10.5.0-x86_64-pc-windows-msvc.zip` contains **`fd.exe`**)
- `scoop install fd`
- `choco install fd`
- `winget install sharkdp.fd`

Same CLI flags as Unix (single cross-platform tool; Windows zip ships `fd.exe` + man page). Completions include PowerShell (`_fd.ps1`).

### Install (macOS)

README: `brew install fd` ([Homebrew formula](https://formulae.brew.sh/formula/fd)); also MacPorts `port install fd`.

### Example command lines

Assume `cwd` already set to session root (spawn option); pattern omitted = list all.

```bash
# Recursive dirs only, no hidden, respect gitignore (defaults)
fd -t d

# Recursive files only, include hidden, ignore gitignore
fd -t f -H -I
# equivalent unrestricted+files: fd -t f -u

# Depth-1 dirs only (shallow picker)
fd -t d -d 1

# Depth-1 files only
fd -t f -d 1

# Both types, NUL-delimited (picker pipe-friendly)
fd -0
fd -t f -0
fd -t d -0
```

Separate commands for files vs dirs are fine (and clearer for UI tabs).

---

## 2. `find` as macOS backup (when `fd` missing)

Primary source: local BSD/macOS `FIND(1)` (`man find`).

### Basics

```bash
# Recursive directories / files
find . -type d
find . -type f

# Depth-limited (BSD find supports -maxdepth; documented as non-POSIX extension shared with GNU)
find . -maxdepth 1 -type d
find . -maxdepth 1 -type f

# Prefer -print0 for safe parsing
find . -maxdepth 1 -type d -print0
```

Notes from man:

- `-type d` / `-type f` — directory / regular file
- `-maxdepth n` — descend at most `n` levels below command-line args; `-maxdepth 0` = only the starting points
- `-print0` — NUL-terminated paths
- **`-H` is NOT “hidden”** — it controls symlink stat behavior for command-line arguments. Do not confuse with `fd -H`.

### Hidden include/exclude (no `-H` for dots)

Stock find has **no** “hidden files” flag. Realistic patterns:

```bash
# Exclude paths under any component named .*
find . -name '.*' -prune -o -type f -print

# Depth-1 non-hidden names only (basename)
find . -maxdepth 1 ! -name '.*' -type d

# Include everything (default): just omit prune / ! -name
find . -type f
```

Caveat: `! -name '.*'` only filters the current basename; pruning with `-name '.*' -prune` is the usual way to skip whole hidden trees. Neither matches Windows “Hidden” attribute semantics.

### `.gitignore` with stock `find`

**Stock `find` does not read `.gitignore`.** There is no flag for it in `FIND(1)`.

Practical options from Git’s own docs:

| Approach                                         | What you get                                                | Citation                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `git ls-files` (default `--cached`)              | Tracked files only                                          | [git-ls-files](https://git-scm.com/docs/git-ls-files)                                  |
| `git ls-files -o --exclude-standard`             | Untracked, applying standard excludes                       | `--exclude-standard` = `.git/info/exclude`, per-dir `.gitignore`, global excludes file |
| `git ls-files -c -o --exclude-standard`          | Tracked + untracked non-ignored files                       | Combine `-c`/`--cached` with `-o`                                                      |
| `git ls-files -o --directory --exclude-standard` | Untracked dirs as `name/` (not contents)                    | `--directory` only with `-o`                                                           |
| Manual `find` + home-grown ignore parser         | Possible but **not** practical for full gitignore semantics | —                                                                                      |

macOS **built-ins that honor gitignore:** none in stock `find`/`ls`/`mdfind`. Use **Git** (`git ls-files`) or a tool that embeds the ignore crate (`fd`, `rg`).

**Parity gap vs `fd`:** `find` can approximate type + depth + name-based hidden filtering; it **cannot** match `fd`’s ignore stack without Git or custom logic.

---

## 3. Windows

### A. Process spawning (Effect / Tauri / Node)

| Mode                                            | What runs                                                                            | Primary source                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| No shell (this app’s path)                      | Named executable + argv (`fd.exe`, `git.exe`, …)                                     | Tauri `Command.create`; Effect `ChildProcess.make` without `shell`; Node `spawn` default `shell: false` |
| `shell: true` / Effect default shell on Windows | **`cmd.exe`** (Effect docs say `cmd.exe`; Node uses `ComSpec` → typically `cmd.exe`) | Effect `ChildProcess.ts`; [Node child_process](https://nodejs.org/api/child_process.html)               |
| Explicit PowerShell                             | Spawn `powershell.exe` or `pwsh.exe` with args                                       | Must name the executable; not automatic                                                                 |
| `cmd /c …`                                      | Explicit `cmd.exe` + `/c`                                                            | Node docs example for `.bat`/`.cmd`                                                                     |

**This repo:** Tauri Live does not pass `shell`. Call sites use direct program names. **Not locked into cmd** unless you choose shell mode or invoke `cmd.exe`/`dir` as the program.

To run built-in `dir`, you typically need `cmd.exe /c dir …` (or a shell), because `dir` is a cmd internal — unlike `fd.exe` / `where.exe`.

### B. Native listing without third-party tools

#### `dir` (cmd)

[Microsoft `dir`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/dir):

| Need                  | Flag / note                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Recursive             | `/s`                                                                                             |
| Bare paths            | `/b`                                                                                             |
| Dirs only             | `/a:d`                                                                                           |
| Files only            | `/a:-d`                                                                                          |
| Include hidden/system | `/a` (no attrs = all, including hidden/system); default without `/a` **omits** hidden and system |
| Depth limit           | **None** documented                                                                              |
| `.gitignore`          | **No**                                                                                           |

Example: `cmd.exe /c dir /s /b /a:d` (dirs, recursive, bare).

#### `Get-ChildItem` (PowerShell)

[Microsoft `Get-ChildItem`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-childitem):

| Need         | Parameter                                                                          |
| ------------ | ---------------------------------------------------------------------------------- |
| Recursive    | `-Recurse`                                                                         |
| Depth limit  | `-Depth <uint>` (PS 5.0+)                                                          |
| Dirs / files | `-Directory` / `-File` (or `-Attributes`)                                          |
| Hidden       | Default hides; `-Force` includes; `-Hidden` / `-Attributes Hidden` for hidden-only |
| `.gitignore` | **No** (not in cmdlet surface)                                                     |

Example: `Get-ChildItem -Recurse -Depth 0 -Directory` (shallow dirs; depth semantics: `0` = Path only’s children per docs’ “Depth 2 includes Path + two subdirectory levels” — verify desired depth off-by-one in implementation tests).

#### `where.exe`

[Microsoft `where`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/where): locate files matching a **name pattern**, optionally `/r <Dir>` recursive. Appends `PATHEXT` when no extension given. **Not** a general directory tree lister for pickers (wrong tool vs `dir`/`fd`).

### C. `fd` on Windows

- Officially supported (README install section; release assets `*-pc-windows-msvc.zip` / `*-pc-windows-gnu.zip`)
- Binary name in release zip: **`fd.exe`** (PATH may still resolve as `fd` from shells)
- Flags same as Unix (see §1)
- Install: winget / scoop / choco / GitHub releases (citations in §1)

### D. Alternatives if `fd` not installed

| Tool                    | Files                         | Dirs                                         | gitignore                | Notes                                                                                              |
| ----------------------- | ----------------------------- | -------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `rg --files`            | Yes                           | **No** (prints files that would be searched) | Yes (default)            | [ripgrep GUIDE](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md); `rg --help` `--files` |
| `git ls-files …`        | Yes (tracked/untracked modes) | Limited (`--directory` with `-o`)            | Via `--exclude-standard` | Repo-only; [git-ls-files](https://git-scm.com/docs/git-ls-files)                                   |
| `dir` / `Get-ChildItem` | Yes                           | Yes                                          | **No**                   | Built-in                                                                                           |
| WSL `find`/`fd`         | —                             | —                                            | —                        | Extra runtime; avoid for desktop product path                                                      |
| Everything Search CLI   | —                             | —                                            | —                        | Not evaluated as a dependency; prefer `fd`                                                         |

**Honest recommendation:** Prefer/require `fd` on macOS and Windows. Fallbacks: macOS `find` (+ `git ls-files` for ignore-aware files); Windows `dir`/`Get-ChildItem` or `rg --files`/`git ls-files` — all strictly weaker than `fd` for “files + dirs + hidden + gitignore + depth.”

---

## 4. Suggested command matrix

Rows assume spawn with `cwd` = session root. “Respect ignore” for `fd` = default ignore stack; for git = `--exclude-standard`.

| Platform       | Tool   | Depth      | Type  | Hidden      | Ignore       | Example argv (program + args)                              |
| -------------- | ------ | ---------- | ----- | ----------- | ------------ | ---------------------------------------------------------- |
| macOS/Win      | `fd`   | full       | dirs  | off         | on           | `fd -t d`                                                  |
| macOS/Win      | `fd`   | full       | files | on          | off          | `fd -t f -H -I`                                            |
| macOS/Win      | `fd`   | 1          | dirs  | off         | on           | `fd -t d -d 1`                                             |
| macOS/Win      | `fd`   | 1          | files | off         | on           | `fd -t f -d 1`                                             |
| macOS/Win      | `fd`   | full       | both  | off         | on           | `fd` or `fd -0`                                            |
| macOS          | `find` | full       | dirs  | off*        | **n/a**      | `find . -name '.*' -prune -o -type d -print`               |
| macOS          | `find` | 1          | dirs  | off*        | **n/a**      | `find . -maxdepth 1 ! -name '.*' -type d`                  |
| macOS          | `find` | full       | files | on          | **n/a**      | `find . -type f`                                           |
| any (git repo) | `git`  | full       | files | (git rules) | on           | `git ls-files -c -o --exclude-standard -z`                 |
| Win            | `cmd`  | full       | dirs  | on          | **n/a**      | `cmd.exe /c dir /s /b /a:d`                                |
| Win            | `cmd`  | full       | files | default†    | **n/a**      | `cmd.exe /c dir /s /b /a:-d`                               |
| Win            | `pwsh` | full/depth | dirs  | Force       | **n/a**      | `Get-ChildItem -Recurse -Directory` (+ `-Depth`, `-Force`) |
| Win/macOS      | `rg`   | full       | files | `--hidden`  | on (default) | `rg --files` / `rg --files --hidden`                       |

\*Name-based dotfiles only, not Windows Hidden attribute.  
†`dir` without `/a` skips hidden/system; add `/a` or `/a:h` as needed ([dir docs](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/dir)).

---

## 5. Implementation notes for this repo

1. **Capabilities:** add `fd` (and optionally `find`, `git`, `cmd`, `rg`) to `shell:allow-spawn` / `allow-execute`, or ship `fd` as a Tauri sidecar and call `Command.sidecar`.
2. **Prefer argv arrays** (`ChildProcess.make('fd', ['-t', 'd', '-d', '1'], { cwd })`) — no shell metacharacter risk.
3. **Parse with `-0` / `-print0` / `git -z`** when paths may contain spaces/newlines.
4. **Shallow picker:** `fd -t d -d 1` replaces `readDirectory`+`stat` for directories; keep Effect FS only as last-resort fallback.
5. **Issue #102 recursive picker:** `fd -t f` and/or `fd -t d` (or untyped `fd`) with default ignore + optional `-H`; filter client-side (fzf-style).

---

## Sources

### Official project docs / man

- [sharkdp/fd README](https://github.com/sharkdp/fd/blob/master/README.md) (features, flags, install including Windows winget/scoop/choco/releases)
- Local `man fd` / `fd --help` (ignore sources, `--no-ignore-vcs`, `--print0`, `--max-depth`, `--type`)
- [fd releases](https://github.com/sharkdp/fd/releases) (`fd.exe` inside Windows zip)
- Local BSD `man find` (macOS): `-type`, `-maxdepth`, `-print0`, `-name`, `-path`, `-H` symlink semantics
- [git-ls-files](https://git-scm.com/docs/git-ls-files) / local `man git-ls-files` (`--exclude-standard`, `-o`, `--directory`)
- [gitignore](https://git-scm.com/docs/gitignore) / local `man gitignore`
- [BurntSushi/ripgrep GUIDE](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md) (gitignore/hidden defaults); local `rg --help` (`--files`)
- [Microsoft `dir`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/dir)
- [Microsoft `Get-ChildItem`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-childitem)
- [Microsoft `where`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/where)
- [Node.js `child_process`](https://nodejs.org/api/child_process.html) (shell / ComSpec / cmd.exe)
- [Tauri Shell plugin](https://v2.tauri.app/plugin/shell/)
- [Homebrew `fd` formula](https://formulae.brew.sh/formula/fd)

### This repo / vendored source

- `apps/desktop/src/acp/sessionDirectoryBrowser.ts` — `readDirectory` + `stat`
- `libs/context-services-tauri/src/ChildProcessSpawnerLive.ts` — Tauri `Command.create` bridge (no shell)
- `apps/desktop/src-tauri/capabilities/default.json` — allowed shell commands
- `node_modules/.pnpm/effect@4.0.0-rc.112/node_modules/effect/src/unstable/process/ChildProcess.ts` — `CommandOptions.shell` → `/bin/sh` or `cmd.exe`
- `node_modules/.pnpm/@tauri-apps+plugin-shell@2.3.5/node_modules/@tauri-apps/plugin-shell/dist-js/index.d.ts` — `Command.create` / `SpawnOptions` (`cwd`, `env`, `encoding` only)

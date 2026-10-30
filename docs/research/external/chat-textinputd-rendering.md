---
Description: This is an external research doc on how the https://github.com/pingdotgg/t3code project handles its main Chat text input
---

# Chat text input rendering

The main chat composer on web and desktop is a Lexical plain-text editor wrapped by
orchestration that owns drafts, `@` / `/` / `$` command menus, and file ingest. Desktop reuses
the web path (Electron wraps the web app). Mobile uses a native editor module with shared trigger
helpers; this document covers the web/`ChatComposer` stack in detail and notes mobile only where
behavior diverges.

User-facing attachment limits and UX live in [`docs/user/composer.md`](../user/composer.md).

## Key files

| Path                                                            | Role                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/components/ChatView.tsx`                          | Mounts the composer; owns **OS file** drag-and-drop on the chat column        |
| `apps/web/src/components/chat/ChatComposer.tsx`                 | Composer shell: draft state, triggers, menus, attachments, send               |
| `apps/web/src/components/ComposerPromptEditor.tsx`              | Lexical editor + inline chips (mentions, skills, citations, terminal context) |
| `apps/web/src/composer-logic.ts`                                | Web trigger detection; collapsed/expanded cursor math for chips               |
| `apps/web/src/composer-editor-mentions.ts`                      | Prompt → Lexical segment model                                                |
| `apps/web/src/components/chat/ComposerCommandMenu.tsx`          | Popover list UI for `@` / `/` / `$`                                           |
| `apps/web/src/components/chat/composerSlashCommandSearch.ts`    | Slash menu filter/rank; position-gates provider commands                      |
| `apps/web/src/components/chat/workspaceFileDrop.ts`             | Finder / Explorer file-drop handlers                                          |
| `apps/web/src/components/chat/composerMentionDrag.ts`           | In-app file-tree → mention drop handlers                                      |
| `apps/web/src/components/files/fileTreeDragMention.ts`          | Tags file-tree drags with a custom MIME type                                  |
| `apps/web/src/components/chat/composerAttachmentFiles.ts`       | Classify / validate pasted and dropped files                                  |
| `apps/web/src/composerDraftStore.ts`                            | Per-thread draft text and attachments                                         |
| `packages/shared/src/composerTrigger.ts`                        | Shared trigger detection + file-link serialization (mobile + helpers)         |
| `packages/shared/src/composerInlineTokens.ts`                   | Parses `@`, `$`, and `[label](path)` tokens in prompt text                    |
| `packages/client-runtime/src/state/composerPathSearch.ts`       | Shared path-search types                                                      |
| `apps/mobile/src/features/threads/ThreadComposer.tsx`           | Mobile composer shell                                                         |
| `apps/mobile/src/features/threads/use-composer-command-menu.ts` | Mobile trigger + popover logic                                                |
| `apps/mobile/src/native/T3ComposerEditor.native.tsx`            | Native text input + inline token chips                                        |

## Component hierarchy (web / desktop)

```
ChatView
└── ComposerSurface.Shell / Host
    └── ChatComposer
        └── <form data-chat-composer-form>
            ├── ComposerBanner.Dock          (banners, stash, tasks, approvals)
            └── ComposerSurface.Main
                └── [surface div data-chat-composer-main-surface]
                    ├── ComposerCommandMenuLayer → ComposerCommandMenu | ComposerStashMenu
                    ├── attachment / context previews
                    ├── ComposerPromptEditor     ← Lexical text input
                    └── footer: ProviderModelPicker, mode controls, ComposerPrimaryActions
```

`ChatView` mounts `ChatComposer` inside the composer surface chrome. The editable field itself is
not a `<textarea>`; it is Lexical’s `PlainTextPlugin` + `ContentEditable`
(`data-testid="composer-editor"`).

## Lexical editor and inline chips

[`ComposerPromptEditor`](../../apps/web/src/components/ComposerPromptEditor.tsx) owns the editing
surface:

1. Prompt string is split into segments (`splitPromptIntoComposerSegments` in
   `composer-editor-mentions.ts`).
2. Segments become Lexical text nodes or decorator nodes:
   - **File mentions** → `ComposerMentionNode` (renders `FileTagChipContent`)
   - **Skills** (`$name`) → `ComposerSkillNode`
   - **Terminal context** → placeholder chip
   - **Citations** → `ComposerCitationNode`
3. On every change, the editor reports:
   - next prompt value
   - **collapsed** cursor (logical offset in the plain string)
   - **expanded** cursor (accounts for chip display width in the DOM)
   - whether the cursor is adjacent to an inline token
   - active terminal context IDs

Collapsed vs expanded cursors matter because chips are wider than their source text. Trigger
detection and menu range replacement use the expanded cursor so `@` / `$` tokens line up with what
the user sees. Token adjacency suppresses trigger detection so a completed mention chip does not
immediately reopen the `@` menu.

```
prompt string  ──parse──►  Lexical nodes (text + DecoratorNodes)
       ▲                           │
       │                           ▼
       └──── onChange (value, collapsedCursor, expandedCursor, adjacentToToken)
```

`ChatComposer.onPromptChange` stores the draft and recomputes the active trigger:

```ts
setComposerTrigger(cursorAdjacentToMention ? null : detectComposerTrigger(nextPrompt, expandedCursor));
```

### Source of truth

The **prompt string** in the draft store is authoritative. Lexical is a view that round-trips that
string through chips. Replacements (menu selection, mention insert, citation insert) mutate the
string via `applyPromptReplacement` / editor handles, then re-sync the editor.

Inline token shapes in the string are defined in
[`composerInlineTokens.ts`](../../packages/shared/src/composerInlineTokens.ts):

- Skills: `$name` bounded by whitespace
- Mentions: `@path`, `@"quoted path"`, or markdown `[basename](encoded-path)` (label must equal
  basename; external URL schemes are rejected)
- Autocomplete emits canonical markdown file links via `serializeComposerFileLink`

## `@`, `/`, and `$` triggers

### Detection

Web detection lives in [`composer-logic.ts`](../../apps/web/src/composer-logic.ts)
(`detectComposerTrigger`). Mobile and shared helpers use
[`packages/shared/src/composerTrigger.ts`](../../packages/shared/src/composerTrigger.ts), which is
the same algorithm plus a dedicated `slash-model` kind for exact `/model` (and `/model <query>`).

Algorithm (web):

1. Clamp cursor; find current line start.
2. If the line prefix from start → cursor matches `^/(\S*)$` → `slash-command` with query after `/`.
3. Else take the current token (back to whitespace):
   - starts with `$` → `skill`
   - starts with `@` → `path`
   - otherwise → no trigger

Each trigger carries `query`, `rangeStart`, and `rangeEnd` so selection can replace exactly the
in-progress token.

| Trigger | When it fires                                                                   | `kind`          | Query          |
| ------- | ------------------------------------------------------------------------------- | --------------- | -------------- |
| `/`     | Only when the whole line prefix is `/` + non-whitespace (no spaces mid-command) | `slash-command` | text after `/` |
| `$`     | Current whitespace-delimited token starts with `$`                              | `skill`         | text after `$` |
| `@`     | Current token starts with `@`                                                   | `path`          | text after `@` |

`/` is checked before `$` / `@` and only when the line starts with `/`. Mid-line `/foo` does not
open the slash menu.

### Popover UI

When `composerTrigger !== null` (and the composer is not in an approval-blocking state),
`ChatComposer` renders `ComposerCommandMenu` inside `ComposerCommandMenuLayer`. The layer measures
`data-chat-composer-main-surface` and positions the menu above the composer.

Menu contents by kind:

| Kind            | Data source                                                                           | Notes                                        |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `path`          | `useComposerPathSearch` → server workspace entries                                    | Loading state while pending                  |
| `slash-command` | Built-ins (`model`, `plan`, `default`), provider slash commands, skills as `/skill:…` | Filtered/ranked by `searchSlashCommandItems` |
| `skill`         | `searchProviderSkills` over the selected provider’s skills                            | Inserts `$name`                              |

Provider slash commands are **position-gated**: offered only when `rangeStart === 0`. Elsewhere they
would reach the agent as literal text, so
`slashCommandItemsForPromptPosition` strips them mid-prompt. Built-ins and skill entries stay
available from any position.

Keyboard navigation is owned by `ComposerCommandKeyPlugin` inside the Lexical editor (ArrowUp /
ArrowDown / Enter / Tab at high priority). Without an open menu, Enter submits (Shift+Enter inserts
a newline on compact / mobile viewports).

### Selection → prompt replacement

`onSelectComposerItem` resolves the live trigger range, then calls `applyPromptReplacement`:

| Item                     | Replacement                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| path                     | `[basename](encoded-path) ` via `serializeComposerFileLink`               |
| skill                    | `$skillName `                                                             |
| slash `model`            | clear trigger text; open `ProviderModelPicker` (does not insert `/model`) |
| slash `plan` / `default` | clear trigger text; toggle interaction mode                               |
| provider slash command   | `/commandName `                                                           |

Replacements use an `expectedText` check so a stale menu click cannot clobber a prompt that moved
underneath. Trailing-space range extension avoids doubling spaces when the user already typed one.

### Web vs shared detector divergence

Shared `detectComposerTrigger` returns `slash-model` for exact `/model`. Web’s copy treats `/model`
as an ordinary `slash-command` with query `"model"` and opens the model picker from the menu item.
Mobile’s menu hook does not fully handle the shared `slash-model` branch for exact `/model`; prefer
the toolbar model control on mobile.

## File ingest: three web paths

OS drops, in-app tree mentions, and clipboard paste are deliberately separate so Finder/Explorer
files become **attachments** while workspace tree rows become **text mentions**.

```
┌─────────────────────────────┐
│ Finder / Explorer Files     │──► ChatView workspace drop ──► addComposerAttachments
└─────────────────────────────┘

┌─────────────────────────────┐
│ Workspace file tree drag    │──► composer form mention drop ──► insert [file](path)
│ MIME: x-t3code-composer-…   │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Clipboard files / images    │──► ComposerPromptEditor onPaste ──► addComposerAttachments
└─────────────────────────────┘
```

### A. OS file drag (Finder / Windows Explorer)

Handlers live in [`workspaceFileDrop.ts`](../../apps/web/src/components/chat/workspaceFileDrop.ts)
and are wired on the **chat column** in `ChatView` (`data-chat-workspace-drop-target`):

1. `dataTransfer.types` must include `"Files"`.
2. `dragenter` / `dragover` → `preventDefault`, `dropEffect = "copy"`, highlight active.
3. `drop` → `Array.from(dataTransfer.files)` → `composerRef.current?.addDroppedFiles(files)`.

`ChatComposerHandle.addDroppedFiles` calls `addComposerAttachments` and focuses the composer.
Nested leave events that stay inside the column do not clear the highlight
(`movedWithinDropTarget`).

### B. In-app file tree → mention text

File tree rows tag the drag with custom MIME
`application/x-t3code-composer-mention`
([`fileTreeDragMention.ts`](../../apps/web/src/components/files/fileTreeDragMention.ts) /
[`composerMentionDrag.ts`](../../apps/web/src/components/chat/composerMentionDrag.ts)).

The composer `<form>` handles this in the **capture** phase:

1. Claim only if the custom MIME is present; `preventDefault` + stop synthetic **and** native
   propagation (otherwise Lexical’s DOM listeners still see the drag).
2. `dropEffect = "move"` (must match the tree’s `effectAllowed` or the browser cancels the drop).
3. Read the payload and `insertMentionAtEnd(`${mention} `)` — serialized markdown file links, not
   binary attachments.

Focus is deferred to the next frame after insert so the editor does not sync a stale empty state
over the new mention.

### C. Paste

`ComposerPromptEditor` forwards paste to `ChatComposer.onComposerPaste`. If the clipboard has files
and `shouldHandleComposerAttachmentPaste` accepts them (prefer images; do not steal paste when
plain text is present unless image-only), the event is prevented and files go through
`addComposerAttachments`.

### After acceptance: `addComposerAttachments`

1. Classify each file (`classifyComposerAttachmentFile`: image / file / unsupported-image). Empty
   or generic MIME types may be inferred from extension so `photo.jpg` still takes the image path.
2. Enforce attachment count and size caps (provider image limits; server file upload cap).
3. Images → compress / HEIC→JPEG when needed → draft as `ComposerImageAttachment` with blob preview.
4. Other files → `ComposerFileAttachment` with the `File` object → draft store → upload queue.
5. Failures surface as thread error + toast.

Draft state lives in `composerDraftStore`; uploads run while connected to a server that supports
file uploads. Send waits until uploads finish (see user composer docs).

## Mobile differences

| Concern           | Web / desktop                    | Mobile                                                               |
| ----------------- | -------------------------------- | -------------------------------------------------------------------- |
| Text engine       | Lexical `ComposerPromptEditor`   | Native `T3ComposerEditor` module                                     |
| Trigger detection | `apps/web/src/composer-logic.ts` | `packages/shared/composerTrigger.ts` via `use-composer-command-menu` |
| Popover           | Portaled `ComposerCommandMenu`   | `ComposerCommandPopover` above the card                              |
| OS file DnD       | Yes (chat column)                | No — photo library, document picker, paste, share sheet              |
| File tree DnD     | Mention text into composer       | N/A                                                                  |
| Inline chips      | Lexical decorator nodes          | Controlled document JSON with token list                             |

## Mental model

```
                 ┌── @ ── path search ──► [file](path) chip
user types ──────┼── / ── slash menu ──► clear / insert / open picker
                 └── $ ── skill menu ──► $skill chip

OS Files drop ──► attachments (draft + upload)
Tree drag ──────► mention text only
Paste files ────► attachments (same as OS drop)
```

The placeholder copy in `ChatComposer` matches this contract: ask anything, `@` tag files/folders,
`$` use skills, `/` for commands.

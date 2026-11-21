# Composer editor: Lexical view-over-text vs t3code's Tiptap rich text

Date: 2026-11-20  
Question: Issue #355 (quote bar on soft-wrapped lines) needed a custom `QuoteBarPlugin` that measures wrapped lines. Lexical is a rich-text editor and t3code renders the same quote with one line of CSS — is there a simpler way, why did we pick Lexical, and should we migrate?

Scope: the Composer prompt editor in `libs/ui` compared with t3code's composer (`/Users/harris/Projects/github_oss_projects/t3code`). No code changes.

## Summary

- t3code no longer uses Lexical. Its composer is Tiptap/ProseMirror. A real `blockquote` node gets `border-inline-start`, so the bar spans wrapped lines for free.
- Our composer keeps the draft string as the editor's text (ADR-0009). The whole draft is **one `ParagraphNode` with `LineBreakNode`s**, so a quote line is inline spans between `<br>`s with no block box to put a border on. That is why the bar needs `QuoteBarPlugin`, not because a Lexical Markdown plugin was missed.
- Lexical was not chosen through a Lexical vs Tiptap comparison. It was copied from t3code's design on 2026-09-03, about two weeks before t3code switched its default to Tiptap.
- t3code did hit the problems ADR-0009 lists. They accepted them and built a large mapping layer to handle them.
- **Decision:** keep Lexical and the current `QuoteBarPlugin`. It works and is small. Migrating carries a lot of risk for little gain right now.

## Our implementation (#355)

- `libs/ui/src/components/sessionChat/composer/editor/plugins/QuoteBarPlugin.tsx` (~66 lines): for each hidden quote `>` marker, it builds a DOM `Range` up to the next `<br>` and counts distinct line tops from `getClientRects()` (`countVisualLines`, unit-tested). It then sets `--composer-quote-lines` on the marker. It reruns on editor updates and on root `ResizeObserver`.
- `ComposerPromptEditor.tsx`: the marker's `::before` bar is `height: calc(lines × line box)`, with a negative bottom margin so the first line box does not grow. It sits in the editor's 12px left padding.
- Draft model: `editorDraft.ts` builds one paragraph and turns `\n` into `LineBreakNode`s. `$getRoot().getTextContent()` is the draft (used by `ChipifyPlugin` and `ExternalValuePlugin`).

## How t3code does it

- `apps/web/src/components/ComposerPromptEditorTiptap.tsx`: a `>`+space input rule wraps the paragraph in a `blockquote` node (`blockquoteInputRule`).
- `apps/web/src/index.css`: `blockquote { border-inline-start: 2px solid …; padding-inline-start: 0.8rem }`. No measuring.
- Lexical offers the same thing (`@lexical/rich-text` `QuoteNode` plus `@lexical/markdown` transformers). ADR-0009 rejected that model, not the plugin.

## Where Lexical is used here

Only `libs/ui/src/components/sessionChat/composer/editor/` (Composer, 5 nodes, 12 plugins). `apps/desktop/package.json` declares `lexical` and `@lexical/react` but never imports them, so the entry is likely unused. Transcript Markdown rendering does not use Lexical.

## Why Lexical (history)

| Date       | Event                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-02 | t3code adds a Lexical composer (`bf70022`)                                                                                          |
| 2026-09-03 | We add Lexical plus `docs/research/external/chat-textinputd-rendering.md`, a description of t3code's _Lexical_ composer (`213f60d`) |
| 2026-09-16 | t3code enables its Tiptap rich-text composer by default (#12160, `d359e94`)                                                         |
| 2026-10-01 | Our #101 / PR #105 (command chips) take Lexical as given                                                                            |
| 2026-10-27 | t3code deletes its Lexical editor (`67661cf`)                                                                                       |
| 2026-11-10 | Our ADR-0009 (PR #315, #260) rejects a Tiptap port                                                                                  |

There was no Lexical vs Tiptap evaluation before adoption. No issue or PR mentions ProseMirror, and the only one that mentions Tiptap is #315, which links ADR-0009. `docs/research/2026-10-21-mui-to-shadcn-tailwind-radix.md` says "Lexical composer: Keep". ADR-0009 rejects Tiptap because of switching cost (an offset map, and replacing the chip, trigger and menu code), not on its merits.

## The ADR-0009 concern, explained

The draft string is what gets sent. Triggers, menu insertion, chips and cursor restore all use positions in that string.

- **View over text (ours):** editor text equals the draft, so editor offset 42 is draft character 42. Nothing needs translating.
- **Rich nodes (Lexical rich text or Tiptap):** block syntax like `> ` becomes node structure, so:
  - the draft must be **serialized** from the tree on every read;
  - **offsets drift**: ProseMirror counts block boundaries, a chip is 1 position but N source characters, and so every position must be converted both ways;
  - **round trips can rewrite text**: `__x__` → `**x**`, escapes in `snake_case`, a leading `1.` turning into a list.

## How t3code handled it (accepted the costs)

From `t3code/docs/internals/composer-editors.md`:

| Problem                | t3code's handling                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two sources of truth   | The draft store owns Markdown and Tiptap owns the document. Content is replaced only when the text changes (cursor moves would pollute undo).                                                                              |
| Offset drift           | "Store cursors are not ProseMirror positions." Collapsed and expanded coordinates, block-boundary counting, and caret positions for empty paragraphs, in `composer-rich-text-doc.ts` (1,960 lines plus a 1,529-line test). |
| Round-trip rewrites    | Partly accepted: rich mode rewrites `__`→`**`, `_`→`*`, `[X]`→`[x]`. Block nodes store exact delimiters as attributes so blocks round-trip unchanged.                                                                      |
| Unserializable nesting | Blocks only form at the top level. Tiptap's block shortcuts (Mod-Shift-8 and others) are removed, because nested blocks would drop text from the draft.                                                                    |
| Clipboard              | Copy uses the Markdown serializer, not DOM text.                                                                                                                                                                           |
| Escape hatch           | Rich text is a setting. Plain mode keeps markers literal, and toggling it remounts from the stored draft.                                                                                                                  |

The `composer-*` modules come to about 7,700 lines with tests, against about 2,000 for our whole editor folder including tests.

## Options considered

1. **Keep `QuoteBarPlugin` (chosen).** Small, isolated and tested, and the minimum fix under the current model. A CSS-only alternative (an inline wrapper element with `box-decoration-break: clone`) would need a new inline node per line and still leave gaps between lines.
2. **One `ParagraphNode` per draft line.** This keeps the ADR-0009 "text is the draft" rule, with lines joined by a single `\n`. A node transform sets `data-md-block` on each paragraph, and quotes, lists and code become plain block CSS, so `QuoteBarPlugin` can be deleted. It is a medium refactor touching `editorDraft.ts` (serialization and offsets), `ChipifyPlugin` and `ExternalValuePlugin` (`getTextContent()` joins paragraphs with `\n\n`), Enter/Shift+Enter, and `BlockMarkerCaretPlugin`. It is worth doing if more block styling is wanted: hanging indent for wrapped list items, a code-block background across wrapped lines, heading margins.
3. **Lexical rich nodes or a Tiptap port.** Needs t3code-scale offset and serialization work and replaces the chip, trigger and menu code. Only justified for true rich editing (task checkboxes, nested lists).

## Sources

- `libs/ui/docs/adr/0009-composer-markdown-styling-is-a-view-over-draft-text.md`
- `libs/ui/src/components/sessionChat/composer/editor/` (`QuoteBarPlugin.tsx`, `ComposerPromptEditor.tsx`, `editorDraft.ts`)
- `docs/research/external/chat-textinputd-rendering.md`
- t3code: `docs/internals/composer-editors.md`, `apps/web/src/components/ComposerPromptEditorTiptap.tsx`, `apps/web/src/index.css`, `apps/web/src/composer-rich-text-doc.ts`, and commits `bf70022`, `d359e94`, `67661cf`

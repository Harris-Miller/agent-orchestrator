# Composer Markdown styling is a view over the draft text

The Composer shows Markdown styled (issue #260) by deriving styled text nodes from the draft string; the editor's text content stays the draft and the only source. Cursor offsets, Composer Triggers, chips, Filesystem Mention rewrites, and the send path therefore keep working on plain string offsets, and a styling bug can only mis-style text, never alter the prompt that is sent.

## Considered options

- **Rich Lexical nodes (headings, quotes, lists, code blocks) with Markdown export/import:** rejected because the draft would be re-serialized on every read, text offsets would no longer match draft offsets (breaking triggers, menu insertion, and cursor restore), and plain prompt characters (`snake_case`, `src/**/*.ts`, a leading `1.`) could be escaped or reinterpreted on the way out.
- **Port t3code's Tiptap/ProseMirror composer:** rejected because it needs its own offset map between document and Markdown and would replace the chip, trigger, and menu code rather than extend it.

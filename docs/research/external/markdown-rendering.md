---
Description: This is an external research doc on how the https://github.com/pingdotgg/t3code project handles displaying Agent Message Markdown in its UI
---

# Chat markdown rendering

Agent and system message bodies in the web chat are rendered by
[`apps/web/src/components/ChatMarkdown.tsx`](../../apps/web/src/components/ChatMarkdown.tsx).
That component is a thin React shell around [`react-markdown`](https://github.com/remarkjs/react-markdown),
which itself is a fixed [unified](https://unifiedjs.com/) pipeline:

1. parse Markdown into an **mdast** (Markdown AST)
2. run **remark** plugins on that tree
3. convert mdast → **hast** (HTML AST)
4. run **rehype** plugins on that tree
5. map hast nodes to React elements via a `components` map

Desktop reuses this path (it wraps the web app). Mobile uses a separate native
markdown stack (`apps/mobile/modules/t3-markdown-text`); this document covers the
web/`ChatMarkdown` pipeline only.

## Dependencies

| Package           | Role                                                |
| ----------------- | --------------------------------------------------- |
| `react-markdown`  | Owns the unified pipeline and React element mapping |
| `remark-gfm`      | GitHub Flavored Markdown syntax                     |
| `remark-breaks`   | Soft line breaks → hard breaks (optional)           |
| `rehype-raw`      | Parse raw HTML embedded in Markdown (optional)      |
| `rehype-sanitize` | Strip unsafe HTML / protocols after raw parsing     |

In-repo remark/rehype helpers live beside the web app (`apps/web/src/markdown-*.ts`)
or in `packages/client-runtime` (Codex directives shared with other clients).

## End-to-end pipeline

```
raw markdown string (message text)
        │
        ▼
┌───────────────────────────────┐
│  micromark parse (+ extensions │  react-markdown / remark-parse
│  registered by remark plugins) │
└───────────────────────────────┘
        │  mdast
        ▼
┌───────────────────────────────┐
│  remarkPlugins (in order)      │
│  1. remarkGfm                  │
│  2. remarkGithubAlerts         │
│  3. remarkNormalizeListItem…   │
│  4. remarkCodexDirectives      │
│  5. remarkBreaks? (optional)   │
│  6. remarkPreserveCodeMeta     │
│  7. remarkNormalizeLinks…      │
│  8. …extraRemarkPlugins        │
└───────────────────────────────┘
        │  mdast
        ▼
┌───────────────────────────────┐
│  mdast → hast                  │  built into react-markdown
└───────────────────────────────┘
        │  hast
        ▼
┌───────────────────────────────┐
│  rehypePlugins (if parseRawHtml)│
│  1. rehypeRaw                  │
│  2. rehypePreserveImageSource… │
│  3. rehypeSanitize (+ schema)  │
└───────────────────────────────┘
        │  hast
        ▼
┌───────────────────────────────┐
│  urlTransform on every href/src│
│  components map → React tree   │
└───────────────────────────────┘
```

Call site wiring (simplified):

```tsx
<ReactMarkdown
  remarkPlugins={remarkPlugins}
  rehypePlugins={parseRawHtml ? CHAT_MARKDOWN_REHYPE_PLUGINS : undefined}
  skipHtml={false}
  components={markdownComponents}
  urlTransform={markdownUrlTransform}
>
  {text}
</ReactMarkdown>
```

### Flags that change the pipeline

| Prop                 | Default | Effect                                                                                                                                                                      |
| -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lineBreaks`         | `false` | Inserts `remark-breaks` after Codex directives. Chat enables this for Codex “★ Insight” blocks and for several non-assistant surfaces that want literal newlines.           |
| `parseRawHtml`       | `true`  | When `false`, skips the entire rehype plugin list. Raw HTML tokens stay as escaped text (`skipHtml={false}`). Used for some timeline surfaces that must not interpret HTML. |
| `extraRemarkPlugins` | `[]`    | Appended after the fixed chat list. Pull request bodies pass `remarkPullRequestAutolinks`.                                                                                  |

Plugin **order is load-bearing**. Earlier remark plugins reshape the tree later ones see; rehype sanitize must run **after** plugins that attach custom `data-*` attributes so those attributes can be allowlisted.

---

## Remark plugins

Remark plugins transform **mdast**. They either register micromark syntax extensions
(so the parser recognizes new tokens) or walk the tree after parse.

### 1. `remark-gfm` (npm)

**What it does:** Enables GitHub Flavored Markdown on top of CommonMark: tables,
strikethrough (`~~`), task lists, autolink literals, and footnotes.

**On raw markdown:**

```markdown
| Feature | Ok  |
| ------- | --- |
| Tables  | ✓   |

~~struck~~ and https://example.com

- [x] done
- [ ] todo
```

Without this plugin those constructs are ordinary paragraphs/lists. With it they
become `table`, `delete`, `link`, and checkbox `listItem` nodes.

### 2. `remarkGithubAlerts` (in-repo)

**Source:** [`apps/web/src/markdown-github-alerts.ts`](../../apps/web/src/markdown-github-alerts.ts)

**What it does:** GitHub’s blockquote alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
`[!WARNING]`, `[!CAUTION]`) are **not** GFM, so `remark-gfm` leaves the marker as
literal text. This plugin finds a blockquote whose first line is exactly one of
those markers, strips the marker line, and sets `data.hProperties.dataAlert` on
the blockquote. The React `blockquote` component styles it as a titled callout.

**On raw markdown:**

```markdown
> [!NOTE]
> Keep the migration reversible.

> [!WARNING] aside on same line
```

The first becomes an alert (`dataAlert: "note"`). The second stays a normal quote —
GitHub only treats a marker that owns its own line.

### 3. `remarkNormalizeListItemIndentation` (in-repo)

**Source:** [`apps/web/src/markdown-list-indentation.ts`](../../apps/web/src/markdown-list-indentation.ts)

**What it does:** CommonMark treats four or more spaces after a list marker as an
indented code block. Agent output often uses accidental alignment like
`-       text`, which would otherwise render every bullet as a code card. The
plugin re-parses same-line, over-indented “code” children of list items back into
paragraph/inline content. Explicit fences (` ``` ` / `~~~`) and conventional
indented code that starts on a later line stay code.

**On raw markdown:**

````markdown
-       accidentally spaced prose
- ```ts
  const ok = true;
  ```
````

````

The first bullet becomes normal text; the fenced block remains a code fence.

### 4. `remarkCodexDirectives` (in-repo, shared)

**Source:** [`packages/client-runtime/src/codexMarkdownDirectives.ts`](../../packages/client-runtime/src/codexMarkdownDirectives.ts)

**What it does:** Registers a **restricted** micromark directive grammar so only
two Codex-emitted names parse as directives (ordinary colons like `10:30` or
`:hover` are untouched). After parse it rewrites:

| Directive | Raw shape | Becomes |
| --- | --- | --- |
| File citation | `:codex-file-citation{path="…" purpose="…"}` | `link` to the path, label = basename |
| Artifact template | `::artifact-template{skill_name=… …}` | empty paragraph with `hName: "div"` + artifact `data-*` props |

Malformed or incomplete directives are restored to literal text so they render as
written. Citations inside existing links are also left literal to avoid nested
anchors.

**On raw markdown:**

```markdown
Created :codex-file-citation{path="outputs/report.xlsx" purpose="output"}.

::artifact-template{skill_name="artifact-template-hello-world" skill_directory="/Users/test/.codex/skills/artifact-template-hello-world" display_name="Hello World" artifact_kind="document"}
````

The citation becomes a file link chip in the React layer; the artifact becomes a
card (`div` with Codex artifact properties), not a prose paragraph.

### 5. `remark-breaks` (npm, optional)

**When:** Only when `lineBreaks` is true (see flags above).

**What it does:** Turns single newlines inside paragraphs into hard line breaks
(`break` nodes → `<br>`), instead of collapsing them as CommonMark normally does.

**On raw markdown:**

```markdown
line one
line two
```

Default pipeline → one flowing paragraph. With `remark-breaks` → two visual lines.

### 6. `remarkPreserveCodeMeta` (in-repo, local to ChatMarkdown)

**What it does:** Fenced code in mdast carries a `meta` string (everything after
the language on the opening fence). That meta does not always survive mdast→hast.
This plugin copies trimmed `meta` onto `data.hProperties.dataCodeMeta` so later
React `pre`/`code` renderers can show titles like `title="x.ts"` or a bare
filename token.

**On raw markdown:**

````markdown
```ts title="src/main.ts"
export const x = 1;
```

```ts src/main.ts
export const y = 2;
```
````

Both fences keep their meta available as `dataCodeMeta` through sanitization into
the code card UI.

### 7. `remarkNormalizeLinksAndTagInlineCode` (in-repo, local to ChatMarkdown)

**What it does:** One tree walk with two jobs:

1. **Windows drive links** — `[x](C:\Users\…\file.ts)` (and definitions) are
   rewritten to `file:///C:/Users/…/file.ts` so they are allowed protocols after
   sanitize / `urlTransform`.
2. **Inline code tagging** — every `inlineCode` node **not** nested inside a link
   gets `dataInlineCode` so the React `code` component can tell `` `path` `` chips
   apart from fenced `<code>` inside `<pre>` (custom components erase the intrinsic
   tag distinction).

**On raw markdown:**

```markdown
See [notes](C:\Users\dev\project\README.md) and `src/app.ts`.
```

The link URL becomes a `file:///` href; the backtick path is marked for file-chip
treatment when it looks like a workspace path.

### 8. `extraRemarkPlugins` (call-site)

**Example:** [`remarkPullRequestAutolinks`](../../apps/web/src/components/pullRequest/pullRequestMarkdown.logic.ts)
in PR markdown turns bare issue/PR references into links against the repository
URL, and stamps `dataPullRequestAutolink` for styling. Chat timeline messages
normally pass an empty list.

---

## Rehype plugins

Rehype plugins transform **hast**. They only run when `parseRawHtml` is true.

### 1. `rehype-raw` (npm)

**What it does:** Parses raw HTML that survived Markdown parsing into real hast
elements (instead of leaving HTML as text / opaque nodes). Needed so agent-authored
HTML snippets and some directive-produced markup participate in the React map.

**On raw markdown:**

```markdown
<div class="note">**bold** still works inside</div>
```

With `rehype-raw`, the `div` becomes an element node whose children can still
contain Markdown-derived emphasis. Without the rehype list, that HTML is not
structured the same way and is effectively inert / escaped depending on path.

### 2. `rehypePreserveImageSourceMeta` (in-repo, local to ChatMarkdown)

**What it does:** Before sanitize strips attributes, copies authored image metadata
onto allowlisted `data-*` props:

- Windows drive `src` → `dataLocalSrc`
- Markdown image title → `dataMarkdownTitle`

**On raw markdown:**

```markdown
![diagram](C:\Users\dev\project\images\diagram.png 'Architecture')
```

Sanitize would otherwise drop or mangle pieces the image renderer needs; the
`data-*` copies ride through to workspace / local image handling.

### 3. `rehype-sanitize` (npm) + `CHAT_MARKDOWN_SANITIZE_SCHEMA`

**What it does:** Whitelists tags, attributes, and URL protocols. The chat schema
extends the default to keep product-specific attrs/protocols:

- `code`: `dataCodeMeta`, `dataInlineCode`
- `blockquote`: `dataAlert`
- `div`: Codex artifact template properties
- `a`: `dataPullRequestAutolink`
- `img`: `dataLocalSrc`, `dataMarkdownTitle`
- `href` protocols: add `file`, `t3-citation`
- `src` protocols: add `file`
- strip global `title` from the default `*` allowlist (titles move via `dataMarkdownTitle`)

Anything not allowlisted is dropped. This is the safety net after `rehype-raw`.

---

## After the ASTs: React mapping

These are not remark/rehype plugins, but they finish the pipeline:

### `urlTransform`

Runs on every URL react-markdown is about to emit. Chat keeps:

- assistant citation hrefs (`t3-citation:…`)
- Windows drive paths already normalized
- rewritten `file:` workspace links

Everything else goes through react-markdown’s `defaultUrlTransform` (blocks
dangerous schemes like `javascript:`).

### `components`

Custom renderers for hast tags (`p`, `a`, `code`, `pre`, `img`, `blockquote`,
`div`, …). This is where product UI appears:

- file path links and inline-code paths → file chips
- fenced code → highlighted code cards (Shiki / Pierre)
- images → workspace/asset previews
- GitHub alerts → styled callouts
- Codex artifact `div`s → artifact cards
- citations → citation chips

Clipboard handling on the wrapper re-serializes the selection back to Markdown so
copying from the rendered view keeps fences, links, and emphasis.

---

## Where messages enter the pipeline

[`MessagesTimeline.tsx`](../../apps/web/src/components/chat/MessagesTimeline.tsx)
passes assistant/system text into `ChatMarkdown`. Typical assistant path:

- `lineBreaks={shouldPreserveAssistantLineBreaks(text)}` — true only for Codex
  “★ Insight” prefixed bodies
- `parseRawHtml` left at default `true` for normal assistant Markdown

Other call sites (proposed plans, file Markdown preview, PR bodies) reuse the same
component with different flag / `extraRemarkPlugins` combinations.

---

## Mental model

| Layer                                | Question it answers                                |
| ------------------------------------ | -------------------------------------------------- |
| micromark + remark syntax extensions | What tokens exist in the source?                   |
| remark tree transforms               | What does this Markdown _mean_ as mdast?           |
| mdast → hast                         | What HTML-shaped tree represents that?             |
| rehype (raw + sanitize)              | Which HTML is real and safe?                       |
| `urlTransform` + `components`        | How does each node look and behave in the chat UI? |

Add syntax or semantic rewrites as **remark** plugins. Add HTML shaping or
security as **rehype** plugins. Add chrome, navigation, and theming in the React
`components` map — not by inventing a second Markdown parser.

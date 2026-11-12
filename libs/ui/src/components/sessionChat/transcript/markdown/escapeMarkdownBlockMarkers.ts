/** Display-only markdown helpers for user message fragments (inline markdown only). */

const INLINE_MARKDOWN_CHAR_RE = /[*_~`[\]]/;
const BLOCK_MARKER_RE =
  /^(?<indent> {0,3})(?:(?<marker>[*+-]|#{1,6})(?=\s|$)|(?<quote>>)|(?<digits>\d+)(?<punct>[.)])(?=\s|$)|(?<rule>[-*_=])(?=\k<rule>{2,}[ \t]*$))/gm;

interface BlockMarkerGroups {
  readonly indent: string;
  readonly marker?: string;
  readonly quote?: string;
  readonly digits?: string;
  readonly punct?: string;
  readonly rule?: string;
}

/** True when `text` contains a character that could start inline markdown. */
export const hasInlineMarkdown = (text: string): boolean => INLINE_MARKDOWN_CHAR_RE.test(text);

/**
 * Backslash-escape line-leading markdown block markers (bullets, headings, quotes, ordered
 * lists, thematic breaks, setext underlines) so user text only renders inline markdown.
 */
export const escapeMarkdownBlockMarkers = (text: string): string =>
  text.replace(BLOCK_MARKER_RE, (...args) => {
    const { indent, marker, quote, digits, punct, rule } = args.at(-1) as BlockMarkerGroups;
    return digits === undefined ? `${indent}\\${marker ?? quote ?? rule}` : `${indent}${digits}\\${punct}`;
  });

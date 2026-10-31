/**
 * Backslash-escape line-leading markdown block markers (bullets, headings, quotes, ordered
 * lists, thematic breaks) so user text only renders inline markdown.
 */
export const escapeMarkdownBlockMarkers = (text: string): string =>
  text.replace(
    /^( {0,3})(?:([*+-]|#{1,6})(?=\s|$)|(>)|(\d+)([.)])(?=\s|$)|([-*_=])(?=\6{2,}[ \t]*$))/gm,
    (_match, indent: string, marker?: string, quote?: string, digits?: string, punct?: string, rule?: string) =>
      digits === undefined ? `${indent}\\${marker ?? quote ?? rule}` : `${indent}${digits}\\${punct}`,
  );

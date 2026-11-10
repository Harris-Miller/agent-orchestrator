import { isWhitespace } from './composerCommandTokens.ts';

/**
 * Pure Markdown styling for the Composer draft. Never rewrites text: every input character lands in
 * exactly one run, so the runs of a line concatenate back to that line. Delimiter rules are stricter
 * than CommonMark so prompt text (`snake_case`, `src/**\/*.ts`, `2*3`) stays plain.
 */

/** Stands in for a chip's text while parsing, so a chip counts as a word and nothing inside it is parsed. */
export const COMPOSER_CHIP_MASK = String.fromCodePoint(0xff_fc);

export const MARKDOWN_BLOCKS = [
  'bullet',
  'codeBlock',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ordered',
  'paragraph',
  'quote',
] as const;
export type MarkdownBlock = (typeof MARKDOWN_BLOCKS)[number];

/**
 * `marker`: inline syntax characters; `blockMarker`: a line-leading `#`, `>`, bullet, or number. Both hide away from
 * the caret's line, except ordered-list numbers, which always show. `fence`: a code fence line, always shown.
 */
export const MARKDOWN_ROLES = ['blockMarker', 'fence', 'marker', 'text'] as const;
export type MarkdownRole = (typeof MARKDOWN_ROLES)[number];

/** Roles whose runs carry a line for Marker reveal. */
export const isMarkerRole = (role: MarkdownRole): boolean => role === 'marker' || role === 'blockMarker';

export type MarkdownRun = {
  readonly block: MarkdownBlock;
  readonly bold: boolean;
  readonly code: boolean;
  readonly italic: boolean;
  readonly role: MarkdownRole;
  readonly strike: boolean;
  readonly text: string;
};

const ASCII_PUNCTUATION_RE = /[!-/:-@[-`{-~]/;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const OPEN_BEFORE = new Set('([{"\'-*_~');
const OPEN_AFTER = new Set('"\'([{*_~`\\$@#<');
const CLOSE_BEFORE = new Set(')]}"\'!?.:`*_~$');
const CLOSE_AFTER = new Set('.,;:!?)]}"\'-*_~');

const isWordChar = (char: string): boolean => char === COMPOSER_CHIP_MASK || WORD_CHAR_RE.test(char);

type Delimiter = {
  readonly canClose: boolean;
  readonly canOpen: boolean;
  readonly char: string;
  readonly len: number;
  remaining: number;
  readonly start: number;
};

type CharAttrs = {
  readonly bold: boolean[];
  readonly code: boolean[];
  readonly italic: boolean[];
  readonly marker: boolean[];
  readonly strike: boolean[];
};

const makeDelimiter = (content: string, start: number, char: string): Delimiter => {
  let end = start;
  while (content[end] === char) {
    end += 1;
  }
  const len = end - start;
  const prev = start > 0 ? content[start - 1] : undefined;
  const next = end < content.length ? content[end] : undefined;
  const valid = char === '~' ? len === 2 : len <= 3;
  const canOpen =
    valid &&
    next !== undefined &&
    (isWordChar(next) || OPEN_AFTER.has(next)) &&
    (prev === undefined || isWhitespace(prev) || OPEN_BEFORE.has(prev));
  const canClose =
    valid &&
    prev !== undefined &&
    (isWordChar(prev) || CLOSE_BEFORE.has(prev)) &&
    (next === undefined || isWhitespace(next) || CLOSE_AFTER.has(next));
  return { canClose, canOpen, char, len, remaining: len, start };
};

const fill = (flags: boolean[], from: number, to: number): void => {
  for (let i = from; i < to; i += 1) {
    flags[i] = true;
  }
};

/** Pair a closer with the nearest matching opener, consuming opener chars from its end and closer chars from its start. */
const pairDelimiters = (opener: Delimiter, closer: Delimiter, attrs: CharAttrs): boolean => {
  const count = opener.char === '~' || (opener.remaining >= 2 && closer.remaining >= 2) ? 2 : 1;
  const openFrom = opener.start + opener.remaining - count;
  const closeFrom = closer.start + closer.len - closer.remaining;
  if (openFrom + count >= closeFrom) {
    return false;
  }
  fill(attrs.marker, openFrom, openFrom + count);
  fill(attrs.marker, closeFrom, closeFrom + count);
  let target = attrs.italic;
  if (opener.char === '~') {
    target = attrs.strike;
  } else if (count === 2) {
    target = attrs.bold;
  }
  fill(target, openFrom + count, closeFrom);
  opener.remaining -= count;
  closer.remaining -= count;
  return true;
};

const applyEmphasis = (delimiters: readonly Delimiter[], attrs: CharAttrs): void => {
  const stack: Delimiter[] = [];
  for (const closer of delimiters) {
    if (closer.canClose) {
      let index = stack.length - 1;
      while (index >= 0 && closer.remaining > 0) {
        const opener = stack[index];
        if (opener.char === closer.char && opener.remaining > 0 && pairDelimiters(opener, closer, attrs)) {
          stack.length = opener.remaining > 0 ? index + 1 : index;
          index = stack.length - 1;
        } else {
          index -= 1;
        }
      }
    }
    if (closer.canOpen && closer.remaining > 0) {
      stack.push(closer);
    }
  }
};

/** Index where the backtick run closing a code span opened by `ticks` backticks starts (searching from `from`), or -1. */
const findCodeSpanEnd = (content: string, from: number, ticks: number): number => {
  let index = from;
  while (index < content.length) {
    if (content[index] === '`') {
      let end = index;
      while (content[end] === '`') {
        end += 1;
      }
      if (end - index === ticks) {
        return index;
      }
      index = end;
    } else {
      index += 1;
    }
  }
  return -1;
};

const markInline = (content: string): CharAttrs => {
  const { length } = content;
  const attrs: CharAttrs = {
    bold: Array.from<boolean>({ length }).fill(false),
    code: Array.from<boolean>({ length }).fill(false),
    italic: Array.from<boolean>({ length }).fill(false),
    marker: Array.from<boolean>({ length }).fill(false),
    strike: Array.from<boolean>({ length }).fill(false),
  };
  const delimiters: Delimiter[] = [];
  let index = 0;
  while (index < length) {
    const char = content[index];
    if (char === '\\' && index + 1 < length && ASCII_PUNCTUATION_RE.test(content[index + 1])) {
      index += 2;
    } else if (char === '`') {
      let ticksEnd = index;
      while (content[ticksEnd] === '`') {
        ticksEnd += 1;
      }
      const ticks = ticksEnd - index;
      const closeStart = findCodeSpanEnd(content, ticksEnd, ticks);
      if (closeStart > ticksEnd) {
        fill(attrs.marker, index, ticksEnd);
        fill(attrs.code, ticksEnd, closeStart);
        fill(attrs.marker, closeStart, closeStart + ticks);
        index = closeStart + ticks;
      } else {
        index = ticksEnd;
      }
    } else if (char === '*' || char === '_' || char === '~') {
      const delimiter = makeDelimiter(content, index, char);
      delimiters.push(delimiter);
      index += delimiter.len;
    } else {
      index += 1;
    }
  }
  applyEmphasis(delimiters, attrs);
  return attrs;
};

const inlineRuns = (content: string, block: MarkdownBlock): MarkdownRun[] => {
  const attrs = markInline(content);
  const runs: MarkdownRun[] = [];
  let runStart = 0;
  const sameAt = (a: number, b: number): boolean =>
    attrs.marker[a] === attrs.marker[b] &&
    (attrs.marker[a] ||
      (attrs.bold[a] === attrs.bold[b] &&
        attrs.italic[a] === attrs.italic[b] &&
        attrs.strike[a] === attrs.strike[b] &&
        attrs.code[a] === attrs.code[b]));
  for (let index = 1; index <= content.length; index += 1) {
    if (index === content.length || !sameAt(runStart, index)) {
      const isMarker = attrs.marker[runStart];
      runs.push({
        block,
        bold: !isMarker && attrs.bold[runStart],
        code: !isMarker && attrs.code[runStart],
        italic: !isMarker && attrs.italic[runStart],
        role: isMarker ? 'marker' : 'text',
        strike: !isMarker && attrs.strike[runStart],
        text: content.slice(runStart, index),
      });
      runStart = index;
    }
  }
  return runs;
};

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^( {0,3})(#{1,6})(?:[ \t]+|$)/;
const QUOTE_RE = /^( {0,3})((?:>[ \t]?)+)/;
const BULLET_RE = /^([ \t]*)[-*+](?:[ \t]+|$)/;
const ORDERED_RE = /^([ \t]*)\d{1,9}[.)](?:[ \t]+|$)/;

type OpenFence = { readonly char: string; readonly length: number };

const openFenceOf = (line: string): OpenFence | undefined => {
  const match = FENCE_RE.exec(line);
  if (match === null || (match[1][0] === '`' && match[2].includes('`'))) {
    return undefined;
  }
  return { char: match[1][0], length: match[1].length };
};

const closesFence = (line: string, fence: OpenFence): boolean => {
  const match = FENCE_RE.exec(line);
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length && match[2].trim() === '';
};

const plainRun = (text: string, block: MarkdownBlock, role: MarkdownRole): MarkdownRun => ({
  block,
  bold: false,
  code: false,
  italic: false,
  role,
  strike: false,
  text,
});

/** Runs for a line that starts with a block marker: indent (text), marker, then the inline rest. */
const blockRuns = (line: string, indent: string, markerEnd: number, block: MarkdownBlock): MarkdownRun[] => {
  const runs: MarkdownRun[] = [];
  if (indent.length > 0) {
    runs.push(plainRun(indent, block, 'text'));
  }
  runs.push(
    plainRun(line.slice(indent.length, markerEnd), block, 'blockMarker'),
    ...inlineRuns(line.slice(markerEnd), block),
  );
  return runs;
};

const HEADING_BLOCKS: readonly MarkdownBlock[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const paragraphLineRuns = (line: string): MarkdownRun[] => {
  const heading = HEADING_RE.exec(line);
  if (heading !== null) {
    return blockRuns(line, heading[1], heading[0].length, HEADING_BLOCKS[heading[2].length - 1]);
  }
  const quote = QUOTE_RE.exec(line);
  if (quote !== null) {
    return blockRuns(line, quote[1], quote[0].length, 'quote');
  }
  const bullet = BULLET_RE.exec(line);
  if (bullet !== null) {
    return blockRuns(line, bullet[1], bullet[0].length, 'bullet');
  }
  const ordered = ORDERED_RE.exec(line);
  if (ordered !== null) {
    return blockRuns(line, ordered[1], ordered[0].length, 'ordered');
  }
  return inlineRuns(line, 'paragraph');
};

/** One entry per `\n`-separated line of `text`; each line's runs concatenate back to that line. */
export const parseComposerMarkdown = (text: string): readonly (readonly MarkdownRun[])[] => {
  let fence: OpenFence | undefined;
  return text.split('\n').map(line => {
    if (fence !== undefined) {
      if (closesFence(line, fence)) {
        fence = undefined;
        return [plainRun(line, 'codeBlock', 'fence')];
      }
      return line.length === 0 ? [] : [plainRun(line, 'codeBlock', 'text')];
    }
    fence = openFenceOf(line);
    return fence === undefined ? paragraphLineRuns(line) : [plainRun(line, 'codeBlock', 'fence')];
  });
};

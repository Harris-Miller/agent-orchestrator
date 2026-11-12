import { findMarkdownLinks } from '../../../host/draftToContentBlocks.ts';
import { isWhitespace } from '../isWhitespace.ts';
import type { AvailableCommand } from '../../../host/sessionUpdateReducer.ts';

export type ChipSegment =
  | { readonly href: string; readonly kind: 'markdownLink'; readonly label: string }
  | { readonly kind: 'command'; readonly value: string }
  | { readonly kind: 'text'; readonly value: string };

/** Wire form for a markdown link chip — shared by composer nodes, clipboard, and mention helpers. */
export const markdownLinkText = (label: string, href: string): string => `[${label}](${href})`;

/** Canonical insertion / chip text for an Available Command name. */
export const commandInvocation = (name: string): string => (name.startsWith('$') ? name : `/${name}`);

export const findExactCommandMatch = (
  token: string,
  availableCommands: readonly AvailableCommand[],
): AvailableCommand | undefined => availableCommands.find(command => commandInvocation(command.name) === token);

const mergeAdjacentTextSegments = (segments: readonly ChipSegment[]): readonly ChipSegment[] => {
  const merged: ChipSegment[] = [];
  for (const segment of segments) {
    const prev = merged.length > 0 ? merged[merged.length - 1] : undefined;
    if (segment.kind === 'text' && prev?.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', value: prev.value + segment.value };
    } else {
      merged.push(segment);
    }
  }
  return merged;
};

const splitMarkdownLinksInText = (text: string): readonly ChipSegment[] => {
  const links = findMarkdownLinks(text);
  if (links.length === 0) {
    return text.length === 0 ? [] : [{ kind: 'text', value: text }];
  }
  const segments: ChipSegment[] = [];
  let cursor = 0;
  for (const link of links) {
    if (link.start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, link.start) });
    }
    segments.push({ href: link.href, kind: 'markdownLink', label: link.label });
    cursor = link.end;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }
  return segments;
};

/**
 * Split text into plain text, Command Chip and Markdown Link Chip segments.
 * Tokens that exact-match a current Available Command become command chips (including at EOF).
 * Complete markdown links become markdown link chips.
 */
export const splitChipSegments = (
  text: string,
  availableCommands: readonly AvailableCommand[],
): readonly ChipSegment[] => {
  if (text.length === 0) {
    return [];
  }

  const segments: ChipSegment[] = [];
  let index = 0;

  while (index < text.length) {
    if (isWhitespace(text[index])) {
      const wsStart = index;
      while (index < text.length && isWhitespace(text[index])) {
        index += 1;
      }
      segments.push({ kind: 'text', value: text.slice(wsStart, index) });
    } else {
      const tokenStart = index;
      while (index < text.length && !isWhitespace(text[index])) {
        index += 1;
      }
      const token = text.slice(tokenStart, index);
      // Exact matches stay chips at EOF too — otherwise deleting the trailing space after a
      // menu insert unwraps `/cmd` into a live `/` trigger and Backspace eats it char-by-char.
      if (findExactCommandMatch(token, availableCommands) !== undefined) {
        segments.push({ kind: 'command', value: token });
      } else {
        segments.push(...splitMarkdownLinksInText(token));
      }
    }
  }

  return mergeAdjacentTextSegments(segments);
};

/** Source text of a segment — what the draft / clipboard holds for it; joining all segments restores the draft. */
export const segmentText = (segment: ChipSegment): string => {
  switch (segment.kind) {
    case 'command':
    case 'text': {
      return segment.value;
    }
    case 'markdownLink': {
      return markdownLinkText(segment.label, segment.href);
    }
  }
};

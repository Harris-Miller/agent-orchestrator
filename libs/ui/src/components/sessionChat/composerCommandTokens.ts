import { findMarkdownLinks } from '../../host/draftToContentBlocks.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

export type ComposerSegment =
  | { readonly href: string; readonly kind: 'markdownLink'; readonly label: string }
  | { readonly kind: 'command'; readonly value: string }
  | { readonly kind: 'text'; readonly value: string };

/** Canonical insertion / chip text for an Available Command name. */
export const commandInvocation = (name: string): string => (name.startsWith('$') ? name : `/${name}`);

export const findExactCommandMatch = (
  token: string,
  availableCommands: readonly AvailableCommand[],
): AvailableCommand | undefined => availableCommands.find(command => commandInvocation(command.name) === token);

export const isWhitespace = (char: string): boolean => char === ' ' || char === '\t' || char === '\n' || char === '\r';

export const mergeAdjacentTextSegments = (segments: readonly ComposerSegment[]): readonly ComposerSegment[] => {
  const merged: ComposerSegment[] = [];
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

const splitMarkdownLinksInText = (text: string): readonly ComposerSegment[] => {
  const links = findMarkdownLinks(text);
  if (links.length === 0) {
    return text.length === 0 ? [] : [{ kind: 'text', value: text }];
  }
  const segments: ComposerSegment[] = [];
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
 * Split draft text into plain text, command-chip, and markdown-link-chip segments.
 * Tokens that exact-match a current Available Command become command chips (including at EOF).
 * Complete markdown links become markdown link chips.
 */
export const splitComposerCommandSegments = (
  text: string,
  availableCommands: readonly AvailableCommand[],
): readonly ComposerSegment[] => {
  if (text.length === 0) {
    return [];
  }

  const segments: ComposerSegment[] = [];
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

export type ComposerTriggerKind = 'at' | 'dollar' | 'slash';

export type ComposerTrigger = {
  readonly kind: ComposerTriggerKind;
  readonly query: string;
  readonly rangeEnd: number;
  readonly rangeStart: number;
};

/** Replace the live trigger range with `invocation` + trailing space (coalesce one existing space). */
export const replaceComposerTriggerRange = (
  text: string,
  trigger: ComposerTrigger,
  invocation: string,
): { readonly cursor: number; readonly text: string } => {
  let { rangeEnd } = trigger;
  if (text[rangeEnd] === ' ') {
    rangeEnd += 1;
  }
  const insertion = `${invocation} `;
  const next = text.slice(0, trigger.rangeStart) + insertion + text.slice(rangeEnd);
  return { cursor: trigger.rangeStart + insertion.length, text: next };
};

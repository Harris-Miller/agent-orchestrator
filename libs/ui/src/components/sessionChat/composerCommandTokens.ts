import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

export type ComposerCommandSegment =
  { readonly kind: 'command'; readonly value: string } | { readonly kind: 'text'; readonly value: string };

/** Canonical insertion / chip text for an Available Command name. */
export const commandInvocation = (name: string): string => (name.startsWith('$') ? name : `/${name}`);

export const findExactCommandMatch = (
  token: string,
  availableCommands: readonly AvailableCommand[],
): AvailableCommand | undefined => availableCommands.find(command => commandInvocation(command.name) === token);

export const isWhitespace = (char: string): boolean => char === ' ' || char === '\t' || char === '\n' || char === '\r';

export const mergeAdjacentTextSegments = (
  segments: readonly ComposerCommandSegment[],
): readonly ComposerCommandSegment[] => {
  const merged: ComposerCommandSegment[] = [];
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

/**
 * Split draft text into plain text and command-chip segments.
 * Whitespace-committed tokens that exact-match a current Available Command become chips.
 */
export const splitComposerCommandSegments = (
  text: string,
  availableCommands: readonly AvailableCommand[],
): readonly ComposerCommandSegment[] => {
  if (text.length === 0) {
    return [];
  }

  const segments: ComposerCommandSegment[] = [];
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
      // Chipify only when whitespace-committed (not a trailing in-progress token at EOF).
      const whitespaceCommitted = index < text.length;
      if (whitespaceCommitted && findExactCommandMatch(token, availableCommands) !== undefined) {
        segments.push({ kind: 'command', value: token });
      } else {
        segments.push({ kind: 'text', value: token });
      }
    }
  }

  return mergeAdjacentTextSegments(segments);
};

export type ComposerTriggerKind = 'dollar' | 'slash';

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

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import { splitComposerCommandSegments } from './composerCommandTokens.ts';
import type { ComposerSegment } from './composerCommandTokens.ts';
import { COMPOSER_CHIP_MASK, parseComposerMarkdown } from './composerMarkdown.ts';
import type { MarkdownBlock, MarkdownRole, MarkdownRun } from './composerMarkdown.ts';
import { markdownLinkText } from './markdownLinkText.ts';

/** How a text piece is styled; `line` is only meaningful for `marker` and `blockMarker` pieces (Marker reveal) and is 0 otherwise. */
export type ComposerTextStyle = {
  readonly block: MarkdownBlock;
  readonly bold: boolean;
  readonly code: boolean;
  readonly italic: boolean;
  readonly line: number;
  readonly role: MarkdownRole;
  readonly strike: boolean;
};

/** One editor node's worth of draft: its concatenated text is always the draft itself. */
export type ComposerPiece =
  | { readonly kind: 'command'; readonly value: string }
  | { readonly kind: 'linebreak' }
  | { readonly href: string; readonly kind: 'markdownLink'; readonly label: string }
  | { readonly kind: 'text'; readonly style: ComposerTextStyle; readonly value: string };

const segmentSource = (segment: ComposerSegment): string => {
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

export const composerPieceText = (piece: ComposerPiece): string => {
  switch (piece.kind) {
    case 'command':
    case 'text': {
      return piece.value;
    }
    case 'linebreak': {
      return '\n';
    }
    case 'markdownLink': {
      return markdownLinkText(piece.label, piece.href);
    }
  }
};

const styleOf = (run: MarkdownRun, line: number): ComposerTextStyle => ({
  block: run.block,
  bold: run.bold,
  code: run.code,
  italic: run.italic,
  line: run.role === 'marker' || run.role === 'blockMarker' ? line : 0,
  role: run.role,
  strike: run.strike,
});

/**
 * Split a draft into editor pieces: chips (Command and Markdown Link) are found first and masked so
 * Markdown styling treats each as one word; the rest is styled text and linebreaks.
 */
export const buildComposerPieces = (
  text: string,
  availableCommands: readonly AvailableCommand[],
): readonly ComposerPiece[] => {
  const chips = new Map<number, ComposerSegment>();
  let masked = '';
  for (const segment of splitComposerCommandSegments(text, availableCommands)) {
    const source = segmentSource(segment);
    if (segment.kind !== 'text') {
      chips.set(masked.length, segment);
    }
    masked += segment.kind === 'text' ? source : COMPOSER_CHIP_MASK.repeat(source.length);
  }

  const pieces: ComposerPiece[] = [];
  let offset = 0;
  parseComposerMarkdown(masked).forEach((runs, line) => {
    if (line > 0) {
      pieces.push({ kind: 'linebreak' });
      offset += 1;
    }
    for (const run of runs) {
      const style = styleOf(run, line);
      let pending = '';
      let index = 0;
      while (index < run.text.length) {
        const chip = chips.get(offset + index);
        if (chip === undefined) {
          pending += run.text[index];
          index += 1;
        } else {
          if (pending.length > 0) {
            pieces.push({ kind: 'text', style, value: pending });
            pending = '';
          }
          pieces.push(chip.kind === 'text' ? { kind: 'text', style, value: chip.value } : chip);
          index += segmentSource(chip).length;
        }
      }
      if (pending.length > 0) {
        pieces.push({ kind: 'text', style, value: pending });
      }
      offset += run.text.length;
    }
  });
  return pieces;
};

const sameStyle = (left: ComposerTextStyle, right: ComposerTextStyle): boolean =>
  left.block === right.block &&
  left.bold === right.bold &&
  left.code === right.code &&
  left.italic === right.italic &&
  left.line === right.line &&
  left.role === right.role &&
  left.strike === right.strike;

export const mergeAdjacentTextPieces = (pieces: readonly ComposerPiece[]): readonly ComposerPiece[] => {
  const merged: ComposerPiece[] = [];
  for (const piece of pieces) {
    const prev = merged.at(-1);
    if (piece.kind === 'text' && prev?.kind === 'text' && sameStyle(prev.style, piece.style)) {
      merged[merged.length - 1] = { ...prev, value: prev.value + piece.value };
    } else {
      merged.push(piece);
    }
  }
  return merged;
};

const pieceEqual = (left: ComposerPiece, right: ComposerPiece): boolean => {
  switch (left.kind) {
    case 'command': {
      return right.kind === 'command' && left.value === right.value;
    }
    case 'linebreak': {
      return right.kind === 'linebreak';
    }
    case 'markdownLink': {
      return right.kind === 'markdownLink' && left.label === right.label && left.href === right.href;
    }
    case 'text': {
      return right.kind === 'text' && left.value === right.value && sameStyle(left.style, right.style);
    }
  }
};

export const composerPiecesEqual = (left: readonly ComposerPiece[], right: readonly ComposerPiece[]): boolean => {
  const a = mergeAdjacentTextPieces(left);
  const b = mergeAdjacentTextPieces(right);
  return a.length === b.length && a.every((piece, index) => pieceEqual(piece, b[index]));
};

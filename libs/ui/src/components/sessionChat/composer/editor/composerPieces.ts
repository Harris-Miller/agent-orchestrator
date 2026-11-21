import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

import { segmentText, splitChipSegments } from '../../chips/chipSegments.ts';
import type { ChipSegment } from '../../chips/chipSegments.ts';
import { COMPOSER_CHIP_MASK, parseComposerMarkdown } from './composerMarkdown.ts';
import type { MarkdownBlock, MarkdownRole, MarkdownRun } from './composerMarkdown.ts';

/** How a text piece is styled; `span` ties the two inline markers of one span together (Marker reveal), '' otherwise. */
export type ComposerTextStyle = {
  readonly block: MarkdownBlock;
  readonly bold: boolean;
  readonly code: boolean;
  readonly italic: boolean;
  readonly role: MarkdownRole;
  readonly span: string;
  readonly strike: boolean;
};

/** One editor node's worth of draft: its concatenated text is always the draft itself. */
export type ComposerPiece =
  | { readonly kind: 'command'; readonly value: string }
  | { readonly kind: 'linebreak' }
  | { readonly kind: 'quoteLine'; readonly pieces: readonly ComposerPiece[] }
  | { readonly href: string; readonly kind: 'markdownLink'; readonly label: string }
  | { readonly kind: 'text'; readonly style: ComposerTextStyle; readonly value: string };

export const composerPieceText = (piece: ComposerPiece): string => {
  if (piece.kind === 'linebreak') {
    return '\n';
  }
  return piece.kind === 'quoteLine' ? piece.pieces.map(composerPieceText).join('') : segmentText(piece);
};

const styleOf = (run: MarkdownRun, line: number): ComposerTextStyle => ({
  block: run.block,
  bold: run.bold,
  code: run.code,
  italic: run.italic,
  role: run.role,
  span: run.span < 0 ? '' : `${line}:${run.span}`,
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
  const chips = new Map<number, Exclude<ChipSegment, { readonly kind: 'text' }>>();
  let masked = '';
  for (const segment of splitChipSegments(text, availableCommands)) {
    const source = segmentText(segment);
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
    const linePieces: ComposerPiece[] = [];
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
            linePieces.push({ kind: 'text', style, value: pending });
            pending = '';
          }
          linePieces.push(chip);
          index += segmentText(chip).length;
        }
      }
      if (pending.length > 0) {
        linePieces.push({ kind: 'text', style, value: pending });
      }
      offset += run.text.length;
    }
    const [first] = runs;
    if (first?.role === 'blockMarker' && first.block === 'quote') {
      pieces.push({ kind: 'quoteLine', pieces: linePieces });
    } else {
      pieces.push(...linePieces);
    }
  });
  return pieces;
};

const sameStyle = (left: ComposerTextStyle, right: ComposerTextStyle): boolean =>
  left.block === right.block &&
  left.bold === right.bold &&
  left.code === right.code &&
  left.italic === right.italic &&
  left.role === right.role &&
  left.span === right.span &&
  left.strike === right.strike;

export const mergeAdjacentTextPieces = (pieces: readonly ComposerPiece[]): readonly ComposerPiece[] => {
  const merged: ComposerPiece[] = [];
  for (const piece of pieces) {
    const prev = merged.at(-1);
    if (piece.kind === 'text' && prev?.kind === 'text' && sameStyle(prev.style, piece.style)) {
      merged[merged.length - 1] = { ...prev, value: prev.value + piece.value };
    } else if (piece.kind === 'quoteLine') {
      merged.push({ kind: 'quoteLine', pieces: mergeAdjacentTextPieces(piece.pieces) });
    } else {
      merged.push(piece);
    }
  }
  return merged;
};

const pieceEqual = (
  left: ComposerPiece,
  right: ComposerPiece,
  piecesEqual: (a: readonly ComposerPiece[], b: readonly ComposerPiece[]) => boolean,
): boolean => {
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
    case 'quoteLine': {
      return right.kind === 'quoteLine' && piecesEqual(left.pieces, right.pieces);
    }
    case 'text': {
      return right.kind === 'text' && left.value === right.value && sameStyle(left.style, right.style);
    }
  }
};

export const composerPiecesEqual = (left: readonly ComposerPiece[], right: readonly ComposerPiece[]): boolean => {
  const a = mergeAdjacentTextPieces(left);
  const b = mergeAdjacentTextPieces(right);
  return a.length === b.length && a.every((piece, index) => pieceEqual(piece, b[index], composerPiecesEqual));
};

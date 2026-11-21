/**
 * The draft <-> Lexical mapping (ADR-0009).
 *
 * Invariant: the editor's text content IS the draft, and it is the only source. Logical cursor offsets are draft
 * offsets; a chip (command or Markdown link) counts as its source text length, a line break as one character.
 * Chips and Markdown styling are a view derived from that text via `buildComposerPieces`.
 */
import {
  $createLineBreakNode,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import type { ElementNode, LexicalNode } from 'lexical';

import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

import { $createComposerCommandNode, $isComposerCommandNode } from './nodes/ComposerCommandNode.tsx';
import { $createComposerMarkdownLinkNode, $isComposerMarkdownLinkNode } from './nodes/ComposerMarkdownLinkNode.tsx';
import { $isComposerChipNode } from './nodes/composerChipNode.ts';
import { $createComposerQuoteLineNode, $isComposerQuoteLineNode } from './nodes/ComposerQuoteLineNode.ts';
import { $createComposerMarkdownTextNode, $readComposerTextStyle } from './nodes/ComposerMarkdownTextNode.ts';
import { buildComposerPieces } from './composerPieces.ts';
import type { ComposerPiece } from './composerPieces.ts';

const $collectPieces = (node: LexicalNode, out: ComposerPiece[]): void => {
  if ($isComposerCommandNode(node)) {
    out.push({ kind: 'command', value: node.getInvocation() });
  } else if ($isComposerMarkdownLinkNode(node)) {
    out.push({ href: node.getHref(), kind: 'markdownLink', label: node.getLabel() });
  } else if ($isTextNode(node)) {
    out.push({ kind: 'text', style: $readComposerTextStyle(node), value: node.getTextContent() });
  } else if ($isLineBreakNode(node)) {
    out.push({ kind: 'linebreak' });
  } else if ($isComposerQuoteLineNode(node)) {
    const inner: ComposerPiece[] = [];
    for (const child of node.getChildren()) {
      $collectPieces(child, inner);
    }
    out.push({ kind: 'quoteLine', pieces: inner });
  } else if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $collectPieces(child, out);
    }
  }
};

export const $readEditorPieces = (): readonly ComposerPiece[] => {
  const pieces: ComposerPiece[] = [];
  $collectPieces($getRoot(), pieces);
  return pieces;
};

const $appendPieces = (parent: ElementNode, pieces: readonly ComposerPiece[]): void => {
  for (const piece of pieces) {
    switch (piece.kind) {
      case 'command': {
        parent.append($createComposerCommandNode(piece.value));
        break;
      }
      case 'linebreak': {
        parent.append($createLineBreakNode());
        break;
      }
      case 'markdownLink': {
        parent.append($createComposerMarkdownLinkNode(piece.label, piece.href));
        break;
      }
      case 'quoteLine': {
        const line = $createComposerQuoteLineNode();
        $appendPieces(line, piece.pieces);
        parent.append(line);
        break;
      }
      case 'text': {
        parent.append($createComposerMarkdownTextNode(piece.value, piece.style));
        break;
      }
    }
  }
};

export const $setComposerContent = (text: string, availableCommands: readonly AvailableCommand[]): void => {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  $appendPieces(paragraph, buildComposerPieces(text, availableCommands));
  root.append(paragraph);
};

export const $getLogicalCursorAndAdjacency = (): { adjacentToToken: boolean; cursor: number } => {
  const selection = $getSelection();
  const root = $getRoot();
  if (!$isRangeSelection(selection)) {
    return { adjacentToToken: false, cursor: root.getTextContentSize() };
  }

  const { anchor } = selection;
  const anchorNode = anchor.getNode();

  type WalkResult = { readonly adjacentToToken: boolean; readonly cursor: number };

  const visit = (node: LexicalNode, cursorBefore: number): null | WalkResult => {
    if ($isComposerChipNode(node)) {
      const size = node.getTextContentSize();
      if (node.getKey() === anchorNode.getKey()) {
        return {
          adjacentToToken: true,
          cursor: cursorBefore + Math.min(anchor.offset, size),
        };
      }
      return null;
    }
    if ($isTextNode(node)) {
      const size = node.getTextContentSize();
      if (node.getKey() === anchorNode.getKey()) {
        const prev = node.getPreviousSibling();
        const next = node.getNextSibling();
        return {
          adjacentToToken:
            (anchor.offset === 0 && $isComposerChipNode(prev)) || (anchor.offset === size && $isComposerChipNode(next)),
          cursor: cursorBefore + Math.min(anchor.offset, size),
        };
      }
      return null;
    }
    if ($isLineBreakNode(node)) {
      if (node.getKey() === anchorNode.getKey()) {
        return { adjacentToToken: false, cursor: cursorBefore };
      }
      return null;
    }
    if (!$isElementNode(node)) {
      return null;
    }
    const children = node.getChildren();
    if (node.getKey() === anchorNode.getKey()) {
      const childIndex = Math.min(anchor.offset, children.length);
      let cursor = cursorBefore;
      for (let i = 0; i < childIndex; i += 1) {
        cursor += children[i].getTextContentSize();
      }
      const atChild = children[childIndex];
      const beforeChild = childIndex > 0 ? children[childIndex - 1] : undefined;
      return {
        adjacentToToken: $isComposerChipNode(atChild) || $isComposerChipNode(beforeChild),
        cursor,
      };
    }
    let cursor = cursorBefore;
    for (const child of children) {
      const hit = visit(child, cursor);
      if (hit !== null) {
        return hit;
      }
      cursor += child.getTextContentSize();
    }
    return null;
  };

  const hit = visit(root, 0);
  if (hit === null) {
    return { adjacentToToken: false, cursor: root.getTextContentSize() };
  }
  return hit;
};

/** Caret at the start of the line after a linebreak: in its first text node when it has one, else before the node. */
const $selectAfterLineBreak = (lineBreak: LexicalNode): void => {
  let next: LexicalNode | null = lineBreak.getNextSibling();
  while ($isComposerQuoteLineNode(next)) {
    next = next.getFirstChild();
  }
  if ($isTextNode(next)) {
    next.select(0, 0);
  } else {
    lineBreak.selectNext(0, 0);
  }
};

export const $setLogicalCursor = (offset: number): void => {
  const root = $getRoot();
  const target = Math.max(0, Math.min(offset, root.getTextContentSize()));
  let remaining = target;

  const visit = (node: LexicalNode): boolean => {
    if ($isComposerChipNode(node)) {
      const size = node.getTextContentSize();
      if (remaining <= size) {
        if (remaining === 0) {
          node.selectStart();
        } else {
          node.selectEnd();
        }
        return true;
      }
      remaining -= size;
      return false;
    }
    if ($isTextNode(node)) {
      const size = node.getTextContentSize();
      if (remaining <= size) {
        node.select(remaining, remaining);
        return true;
      }
      remaining -= size;
      return false;
    }
    if ($isLineBreakNode(node)) {
      if (remaining === 0) {
        $selectAfterLineBreak(node);
        return true;
      }
      remaining -= 1;
      return false;
    }
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        if (visit(child)) {
          return true;
        }
      }
    }
    return false;
  };

  if (!visit(root)) {
    root.selectEnd();
  }
};

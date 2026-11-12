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
import type { LexicalNode } from 'lexical';

import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

import { $createComposerCommandNode, $isComposerCommandNode } from './nodes/ComposerCommandNode.tsx';
import { $createComposerMarkdownLinkNode, $isComposerMarkdownLinkNode } from './nodes/ComposerMarkdownLinkNode.tsx';
import { $isComposerChipNode } from './nodes/composerChipNode.ts';
import { $createComposerMarkdownTextNode, $readComposerTextStyle } from './nodes/ComposerMarkdownTextNode.ts';
import { buildComposerPieces } from './composerPieces.ts';
import type { ComposerPiece } from './composerPieces.ts';

export const $readEditorPieces = (): readonly ComposerPiece[] => {
  const pieces: ComposerPiece[] = [];
  const visit = (node: LexicalNode): void => {
    if ($isComposerCommandNode(node)) {
      pieces.push({ kind: 'command', value: node.getInvocation() });
      return;
    }
    if ($isComposerMarkdownLinkNode(node)) {
      pieces.push({ href: node.getHref(), kind: 'markdownLink', label: node.getLabel() });
      return;
    }
    if ($isTextNode(node)) {
      pieces.push({ kind: 'text', style: $readComposerTextStyle(node), value: node.getTextContent() });
      return;
    }
    if ($isLineBreakNode(node)) {
      pieces.push({ kind: 'linebreak' });
      return;
    }
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        visit(child);
      }
    }
  };
  visit($getRoot());
  return pieces;
};

export const $setComposerContent = (text: string, availableCommands: readonly AvailableCommand[]): void => {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  for (const piece of buildComposerPieces(text, availableCommands)) {
    switch (piece.kind) {
      case 'command': {
        paragraph.append($createComposerCommandNode(piece.value));
        break;
      }
      case 'linebreak': {
        paragraph.append($createLineBreakNode());
        break;
      }
      case 'markdownLink': {
        paragraph.append($createComposerMarkdownLinkNode(piece.label, piece.href));
        break;
      }
      case 'text': {
        paragraph.append($createComposerMarkdownTextNode(piece.value, piece.style));
        break;
      }
    }
  }
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
        node.selectNext(0, 0);
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

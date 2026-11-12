import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  DELETE_CHARACTER_COMMAND,
} from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

import { isWhitespace } from '../../../isWhitespace.ts';
import { $isComposerChipNode } from '../nodes/composerChipNode.ts';

const isOnlyWhitespace = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    if (!isWhitespace(text[i])) {
      return false;
    }
  }
  return text.length > 0;
};

const $removeChipAndPad = (chip: LexicalNode, pad: TextNode, padStart: number, padEnd: number): void => {
  if (padStart === 0 && padEnd === pad.getTextContentSize()) {
    pad.remove();
  } else {
    pad.spliceText(padStart, padEnd - padStart, '');
  }
  chip.remove();
};

/** Backspace/Delete against a chip (or its trailing/leading pad space) removes the whole chip. */
const $deleteAdjacentComposerChip = (isBackward: boolean): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const { anchor } = selection;
  const anchorNode = anchor.getNode();

  if ($isComposerChipNode(anchorNode)) {
    anchorNode.remove();
    return true;
  }

  if (!$isTextNode(anchorNode)) {
    return false;
  }

  const text = anchorNode.getTextContent();
  const { offset } = anchor;

  if (isBackward) {
    if (offset === 0) {
      const prev = anchorNode.getPreviousSibling();
      if ($isComposerChipNode(prev)) {
        prev.remove();
        return true;
      }
      return false;
    }

    // Cursor after whitespace pad that follows a chip (menu insert adds ` `).
    const before = text.slice(0, offset);
    const prev = anchorNode.getPreviousSibling();
    if (isOnlyWhitespace(before) && $isComposerChipNode(prev)) {
      $removeChipAndPad(prev, anchorNode, 0, offset);
      return true;
    }
    return false;
  }

  if (offset === text.length) {
    const next = anchorNode.getNextSibling();
    if ($isComposerChipNode(next)) {
      next.remove();
      return true;
    }
    return false;
  }

  const after = text.slice(offset);
  const next = anchorNode.getNextSibling();
  if (isOnlyWhitespace(after) && $isComposerChipNode(next)) {
    $removeChipAndPad(next, anchorNode, offset, text.length);
    return true;
  }

  return false;
};

export const ChipDeletePlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        isBackward => $deleteAdjacentComposerChip(isBackward),
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );

  return null;
};

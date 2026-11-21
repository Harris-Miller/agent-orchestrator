import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  DELETE_CHARACTER_COMMAND,
  HISTORY_MERGE_TAG,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ENTER_COMMAND,
  mergeRegister,
} from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

import { $readComposerTextStyle } from '../nodes/ComposerMarkdownTextNode.ts';
import { $isComposerQuoteLineNode } from '../nodes/ComposerQuoteLineNode.ts';

/** A `#`, `>`, or bullet marker, which Markdown styling never shows (ordered numbers do show). */
const $isHiddenBlockMarker = (node: LexicalNode | null | undefined): node is TextNode => {
  if (!$isTextNode(node)) {
    return false;
  }
  const { block, role } = $readComposerTextStyle(node);
  return role === 'blockMarker' && block !== 'ordered';
};

/** The hidden block marker a collapsed caret sits right after (the visible start of its line's content), if any. */
const $hiddenMarkerBeforeCaret = (): TextNode | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text') {
    return null;
  }
  const node = selection.anchor.getNode();
  if ($isHiddenBlockMarker(node) && selection.anchor.offset === node.getTextContentSize()) {
    return node;
  }
  const prev = node.getPreviousSibling();
  return selection.anchor.offset === 0 && $isHiddenBlockMarker(prev) ? prev : null;
};

/** A text caret at the end of `node`, descending into a quote line wrapper to its last descendant. */
const $selectEndOf = (node: LexicalNode): void => {
  let last: LexicalNode = node;
  while ($isComposerQuoteLineNode(last)) {
    const child = last.getLastChild();
    if (child === null) {
      break;
    }
    last = child;
  }
  if ($isTextNode(last)) {
    last.select(last.getTextContentSize(), last.getTextContentSize());
  } else {
    last.selectEnd();
  }
};

/** The quote marker starting the line `node` is on, if that line is a quote. */
const $quoteMarkerOfCaretLine = (node: LexicalNode): TextNode | null => {
  let found: TextNode | null = null;
  for (
    let sibling: LexicalNode | null = $isComposerQuoteLineNode(node) ? node.getFirstChild() : node;
    sibling !== null && sibling.getType() !== 'linebreak';
    sibling = sibling.getPreviousSibling()
  ) {
    if ($isTextNode(sibling) && $isHiddenBlockMarker(sibling) && $readComposerTextStyle(sibling).block === 'quote') {
      found = sibling;
    }
  }
  return found;
};

/** Whether anything but the marker (text or a chip) follows it on its line. */
const $lineHasContentAfter = (marker: TextNode): boolean => {
  for (
    let sibling = marker.getNextSibling();
    sibling !== null && sibling.getType() !== 'linebreak';
    sibling = sibling.getNextSibling()
  ) {
    if (sibling.getTextContentSize() > 0) {
      return true;
    }
  }
  return false;
};

/**
 * Hidden block markers are invisible, so keep the caret out of them: it snaps to the start of the line's content,
 * ArrowLeft there goes to the end of the previous line, and Backspace there removes the marker.
 */
export const BlockMarkerCaretPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        const inside = editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return null;
          }
          const node = selection.anchor.getNode();
          // An element caret at the start of a quote line sits before the hidden marker.
          if (selection.anchor.type === 'element') {
            const first = $isComposerQuoteLineNode(node) && selection.anchor.offset === 0 ? node.getFirstChild() : null;
            return $isHiddenBlockMarker(first) ? first.getKey() : null;
          }
          return $isHiddenBlockMarker(node) && selection.anchor.offset < node.getTextContentSize()
            ? node.getKey()
            : null;
        });
        if (inside !== null) {
          editor.update(
            () => {
              const node = $getRoot()
                .getAllTextNodes()
                .find(candidate => candidate.getKey() === inside);
              node?.select(node.getTextContentSize(), node.getTextContentSize());
            },
            { tag: ['md-caret', HISTORY_MERGE_TAG] },
          );
        }
      }),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        event => {
          const marker = event.shiftKey ? null : $hiddenMarkerBeforeCaret();
          if (marker === null) {
            return false;
          }
          event.preventDefault();
          // A quote marker is its line wrapper's first child, so step out from the wrapper.
          const parent = marker.getParent();
          const lineStart = $isComposerQuoteLineNode(parent) ? parent : marker;
          const lineBreak = lineStart.getPreviousSibling();
          const before = lineBreak?.getPreviousSibling() ?? null;
          if (before === null) {
            lineBreak?.selectPrevious();
          } else {
            $selectEndOf(before);
          }
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // Shift+Enter in a quote continues it; on an empty quote line it leaves the quote instead.
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        event => {
          const selection = $getSelection();
          if (event === null || !event.shiftKey || !$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const marker = $quoteMarkerOfCaretLine(selection.anchor.getNode());
          if (marker === null) {
            return false;
          }
          event.preventDefault();
          if ($lineHasContentAfter(marker)) {
            selection.insertLineBreak();
            selection.insertText(marker.getTextContent());
          } else {
            marker.remove();
          }
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        isBackward => {
          const marker = isBackward ? $hiddenMarkerBeforeCaret() : null;
          if (marker === null) {
            return false;
          }
          marker.selectNext(0, 0);
          marker.remove();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  return null;
};

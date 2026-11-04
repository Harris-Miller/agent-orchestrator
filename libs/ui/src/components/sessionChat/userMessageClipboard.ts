import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import { splitComposerCommandSegments } from './composerCommandTokens.ts';
import type { ComposerSegment } from './composerCommandTokens.ts';
import { markdownLinkText } from './markdownLinkText.ts';
import { prepareChatMarkdownText } from './stripEmbeddedContextBlocks.ts';

/** Plain-text form that pastes back into the composer as the original chip source. */
export const segmentCopyText = (segment: ComposerSegment): string => {
  switch (segment.kind) {
    case 'command':
      return segment.value;
    case 'markdownLink':
      return markdownLinkText(segment.label, segment.href);
    case 'text':
      return segment.value;
  }
};

/** Sanitized Markdown source of a user message: hidden blocks stripped, chips restored to their raw form. */
export const userMessageMarkdown = (text: string, availableCommands: readonly AvailableCommand[]): string =>
  splitComposerCommandSegments(prepareChatMarkdownText(text), availableCommands).map(segmentCopyText).join('');

const selectedSliceOfTextNode = (textNode: Text, range: Range): string => {
  if (!range.intersectsNode(textNode)) {
    return '';
  }
  const start = textNode === range.startContainer ? range.startOffset : 0;
  const end = textNode === range.endContainer ? range.endOffset : textNode.data.length;
  return textNode.data.slice(start, end);
};

/**
 * Build clipboard plain text for a selection inside a user-message root.
 * Chip hosts with `data-copy-text` contribute that value (composer-parity) instead of visible label text.
 */
export const clipboardTextFromSelectionInRoot = (root: HTMLElement): null | string => {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }

  const parts: string[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(selectedSliceOfTextNode(node as Text, range));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node as HTMLElement;
    const { copyText } = element.dataset;
    if (copyText !== undefined) {
      if (range.intersectsNode(element)) {
        parts.push(copyText);
      }
      return;
    }
    for (const child of node.childNodes) {
      if (range.intersectsNode(child)) {
        walk(child);
      }
    }
  };

  walk(root);
  return parts.join('');
};

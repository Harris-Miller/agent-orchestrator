import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  mergeRegister,
} from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

import { $readComposerTextStyle } from '../nodes/ComposerMarkdownTextNode.ts';

/** Span ids (see `ComposerTextStyle.span`) whose opening-to-closing marker range holds the selection's anchor or focus. */
const $activeMarkerSpans = (): ReadonlySet<string> => {
  const active = new Set<string>();
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return active;
  }
  const nodes = $getRoot().getAllTextNodes();
  const keys = nodes.map(node => node.getKey());
  const ends = [selection.anchor.getNode().getKey(), selection.focus.getNode().getKey()].map(key => keys.indexOf(key));
  const opened = new Map<string, number>();
  nodes.forEach((node, index) => {
    const { span } = $readComposerTextStyle(node);
    if (span === '') {
      return;
    }
    const openedAt = opened.get(span);
    if (openedAt === undefined) {
      opened.set(span, index);
    } else if (ends.some(end => end >= openedAt && end <= index)) {
      active.add(span);
    }
  });
  return active;
};

/** Marker reveal: inline markers show only while the caret is inside their span and the editor is focused. */
export const MarkerRevealPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const reveal = (): void => {
      const root = editor.getRootElement();
      if (root === null) {
        return;
      }
      const focused = root.ownerDocument.activeElement === root;
      const active = focused ? editor.getEditorState().read($activeMarkerSpans) : new Set<string>();
      for (const marker of root.querySelectorAll<HTMLElement>('[data-md-span]')) {
        marker.toggleAttribute('data-md-active', active.has(marker.dataset.mdSpan ?? ''));
      }
    };
    const onFocusChange = (): boolean => {
      reveal();
      return false;
    };
    reveal();
    return mergeRegister(
      editor.registerUpdateListener(reveal),
      editor.registerCommand(FOCUS_COMMAND, onFocusChange, COMMAND_PRIORITY_LOW),
      editor.registerCommand(BLUR_COMMAND, onFocusChange, COMMAND_PRIORITY_LOW),
    );
  }, [editor]);

  return null;
};

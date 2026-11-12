import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, HISTORY_MERGE_TAG } from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

import type { AvailableCommand } from '../../../../../host/sessionUpdateReducer.ts';

import { buildComposerPieces, composerPiecesEqual } from '../composerPieces.ts';
import {
  $getLogicalCursorAndAdjacency,
  $readEditorPieces,
  $setComposerContent,
  $setLogicalCursor,
} from '../editorDraft.ts';

/** Re-derives chips and Markdown styling from the draft text whenever an edit leaves the nodes out of step with it. */
export const ChipifyPlugin: FC<{ readonly availableCommands: readonly AvailableCommand[] }> = ({
  availableCommands,
}) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, tags }) => {
        // Rebuilding mid-composition would cancel an IME / dead-key sequence.
        if (tags.has('chipify') || tags.has('external-sync') || editor.isComposing()) {
          return;
        }
        editorState.read(() => {
          const text = $getRoot().getTextContent();
          if (composerPiecesEqual(buildComposerPieces(text, availableCommands), $readEditorPieces())) {
            return;
          }
          const { cursor } = $getLogicalCursorAndAdjacency();
          editor.update(
            () => {
              $setComposerContent(text, availableCommands);
              $setLogicalCursor(cursor);
            },
            // History-merge keeps the rebuild in the same undo step as the keystroke that caused it.
            { tag: ['chipify', HISTORY_MERGE_TAG] },
          );
        });
      }),
    [availableCommands, editor],
  );

  return null;
};

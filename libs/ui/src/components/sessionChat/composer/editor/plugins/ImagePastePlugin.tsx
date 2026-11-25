import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

import { classifyClipboardPaste, filesFromDataTransfer } from '../../../../../host/composerImageTransfer.ts';

/** Image-only clipboard → `onPasteImages`; anything with text stays a normal Lexical text paste. */
export const ImagePastePlugin: FC<{ readonly onPasteImages: (files: readonly File[]) => void }> = ({
  onPasteImages,
}) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        event => {
          if (!(event instanceof ClipboardEvent) || event.clipboardData === null) {
            return false;
          }
          const result = classifyClipboardPaste({
            files: filesFromDataTransfer(event.clipboardData),
            text: event.clipboardData.getData('text/plain'),
          });
          if (result._tag === 'Ignore') {
            return false;
          }
          event.preventDefault();
          onPasteImages(result.files);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, onPasteImages],
  );

  return null;
};

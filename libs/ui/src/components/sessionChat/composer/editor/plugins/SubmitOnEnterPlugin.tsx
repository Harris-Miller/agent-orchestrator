import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

export const SubmitOnEnterPlugin: FC<{ readonly menuOpen: boolean; readonly onSubmit: () => void }> = ({
  menuOpen,
  onSubmit,
}) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        event => {
          if (menuOpen) {
            return false;
          }
          if (event === null || event.shiftKey) {
            return false;
          }
          event.preventDefault();
          onSubmit();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, menuOpen, onSubmit],
  );

  return null;
};

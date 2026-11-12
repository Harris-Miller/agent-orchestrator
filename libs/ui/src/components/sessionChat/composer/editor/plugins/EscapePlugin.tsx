import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, KEY_ESCAPE_COMMAND } from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

/** Runs below the command menu's CRITICAL Esc handler, so an open menu dismisses first. */
export const EscapePlugin: FC<{ readonly onEscape: () => void }> = ({ onEscape }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        event => {
          event.preventDefault();
          onEscape();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, onEscape],
  );

  return null;
};

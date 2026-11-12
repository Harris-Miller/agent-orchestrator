import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
} from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

export type ComposerCommandMenuKeyHandlers = {
  readonly onArrowDown: () => void;
  readonly onArrowUp: () => void;
  readonly onDismiss: () => void;
  readonly onSelect: () => void;
  readonly onSpaceDismiss: () => void;
  readonly open: boolean;
};

export const CommandMenuKeyPlugin: FC<{ readonly commandMenu?: ComposerCommandMenuKeyHandlers }> = ({
  commandMenu,
}) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (commandMenu === undefined) {
      return;
    }

    const { open } = commandMenu;
    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onArrowUp();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onArrowDown();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event?.preventDefault();
          commandMenu.onSelect();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onSelect();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onDismiss();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_SPACE_COMMAND,
        () => {
          if (!open) {
            return false;
          }
          commandMenu.onSpaceDismiss();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [commandMenu, editor]);

  return null;
};

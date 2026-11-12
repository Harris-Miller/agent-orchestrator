import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { useEffect, useRef } from 'react';
import type { FC, RefObject } from 'react';

import type { AvailableCommand } from '../../../../../host/sessionUpdateReducer.ts';

import { $setComposerContent, $setLogicalCursor } from '../editorDraft.ts';

export const ExternalValuePlugin: FC<{
  readonly availableCommands: readonly AvailableCommand[];
  readonly lastEmittedRef: RefObject<string>;
  readonly syncCursorRef?: RefObject<null | number>;
  readonly value: string;
}> = ({ availableCommands, lastEmittedRef, syncCursorRef, value }) => {
  const [editor] = useLexicalComposerContext();
  const commandsKey = availableCommands.map(command => command.name).join('\0');
  const prevCommandsKeyRef = useRef(commandsKey);

  useEffect(() => {
    const commandsChanged = prevCommandsKeyRef.current !== commandsKey;
    prevCommandsKeyRef.current = commandsKey;

    if (value === lastEmittedRef.current && !commandsChanged) {
      return;
    }

    editor.update(
      () => {
        if ($getRoot().getTextContent() === value && !commandsChanged) {
          lastEmittedRef.current = value;
          return;
        }
        $setComposerContent(value, availableCommands);
        lastEmittedRef.current = value;
        const syncCursor = syncCursorRef?.current ?? null;
        if (syncCursor !== null && syncCursorRef !== undefined) {
          $setLogicalCursor(syncCursor);
          syncCursorRef.current = null;
        }
      },
      { tag: 'external-sync' },
    );
  }, [availableCommands, commandsKey, editor, lastEmittedRef, syncCursorRef, value]);

  return null;
};

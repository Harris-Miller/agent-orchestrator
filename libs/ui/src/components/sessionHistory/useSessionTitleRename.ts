import { useState } from 'react';

/**
 * Edit state shared by `SessionTitleInlineRename` and `SessionActionsMenu`. Tracks which session is being edited,
 * so switching sessions mid-edit cancels the edit instead of committing the old text to the new session.
 */
export const useSessionTitleRename = (sessionId: string | undefined) => {
  const [renamingSessionId, setRenamingSessionId] = useState<string | undefined>(undefined);

  return {
    onRenameRequest: () => {
      setRenamingSessionId(sessionId);
    },
    titleProps: {
      editing: sessionId !== undefined && renamingSessionId === sessionId,
      onEditingChange: (editing: boolean) => {
        setRenamingSessionId(editing ? sessionId : undefined);
      },
    },
  };
};

import { ConfirmSessionDeleteDialog, SessionHistoryRow, useSessionDeleteRequest } from '@lib/ui';
import type { UnifiedHistoryEntry } from '@lib/ui';
import { useContext } from 'react';
import type { FC } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';

/** Session History rows plus their delete-confirm dialog. Shared by Session History and Recent sessions. */
export const SessionRows: FC<{
  readonly selectedSessionId: string | undefined;
  readonly sessions: readonly UnifiedHistoryEntry[];
}> = ({ selectedSessionId, sessions }) => {
  const onClientError = useContext(OnClientErrorContext);
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);

  return (
    <>
      {sessions.map(entry => (
        <SessionHistoryRow
          entry={entry}
          key={`${entry.launchTarget}:${entry.sessionId}`}
          onClientError={onClientError}
          onDeleteRequest={requestDelete}
          selected={selectedSessionId === entry.sessionId}
        />
      ))}
      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </>
  );
};

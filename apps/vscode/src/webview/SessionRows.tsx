import { ConfirmSessionDeleteDialog, sessionEntryKey, SessionHistoryRow, useSessionDeleteRequest } from '@lib/ui';
import type { BulkSessionSelection, UnifiedHistoryEntry } from '@lib/ui';
import { useContext } from 'react';
import type { FC } from 'react';
import Divider from '@mui/material/Divider';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';

import { OnClientErrorContext } from './onClientError.tsx';

/** Session History rows plus their delete-confirm dialog. Shared by Session History and Recent sessions. */
export const SessionRows: FC<{
  /** Rendered once under a Pinned heading above `sessions`; the caller excludes them from `sessions`. */
  readonly pinnedSessions?: readonly UnifiedHistoryEntry[];
  /** Bulk select state; rows show checkboxes while it is active. */
  readonly bulk?: BulkSessionSelection;
  readonly selectedSessionId: string | undefined;
  readonly sessions: readonly UnifiedHistoryEntry[];
}> = ({ bulk, pinnedSessions = [], selectedSessionId, sessions }) => {
  const onClientError = useContext(OnClientErrorContext);
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);
  const rowSelection = (entry: UnifiedHistoryEntry) =>
    bulk?.active === true ? { checked: bulk.isSelected(entry), onToggle: () => bulk.toggle(entry) } : undefined;

  return (
    <>
      {pinnedSessions.length > 0 ? (
        <>
          <ListItem>
            <Typography color="text.secondary" variant="subtitle2">
              Pinned
            </Typography>
          </ListItem>
          {pinnedSessions.map(entry => (
            <SessionHistoryRow
              entry={entry}
              key={sessionEntryKey(entry)}
              onClientError={onClientError}
              onDeleteRequest={requestDelete}
              selected={selectedSessionId === entry.sessionId}
              selection={rowSelection(entry)}
            />
          ))}
          {sessions.length > 0 ? <Divider sx={{ my: 1 }} /> : null}
        </>
      ) : null}
      {sessions.map(entry => (
        <SessionHistoryRow
          entry={entry}
          key={sessionEntryKey(entry)}
          onClientError={onClientError}
          onDeleteRequest={requestDelete}
          selected={selectedSessionId === entry.sessionId}
          selection={rowSelection(entry)}
        />
      ))}
      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </>
  );
};

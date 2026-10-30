import { useAtomValue } from '@effect/atom-react';
import {
  ConfirmSessionDeleteDialog,
  sessionCwdAtom,
  SessionHistoryRow,
  sessionsForCwd,
  unifiedSessionHistoryAtom,
  useSessionDeleteRequest,
  virtualLifecycleInFlightAtom,
} from '@lib/ui';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import { useContext } from 'react';
import type { FC } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';

const RECENT_LIMIT = 5;

/** Empty Virtual Chat slot: newest Sessions for this Workspace cwd. Renders inside a `List`. */
export const RecentSessions: FC = () => {
  const inFlight = useAtomValue(virtualLifecycleInFlightAtom);
  const sessions = sessionsForCwd(useAtomValue(unifiedSessionHistoryAtom), useAtomValue(sessionCwdAtom)).slice(
    0,
    RECENT_LIMIT,
  );
  const onClientError = useContext(OnClientErrorContext);
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);

  if (sessions.length === 0) {
    return null;
  }

  return (
    <>
      <ListItem>
        <Typography color="text.secondary" variant="subtitle2">
          Recent sessions
        </Typography>
      </ListItem>
      {sessions.map(entry => (
        <SessionHistoryRow
          disabled={inFlight}
          entry={entry}
          key={`${entry.launchTarget}:${entry.sessionId}`}
          onClientError={onClientError}
          onDeleteRequest={requestDelete}
          selected={false}
        />
      ))}
      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </>
  );
};

import { useAtomValue } from '@effect/atom-react';
import { sessionCwdAtom, sessionsForCwd, unifiedSessionHistoryAtom, virtualMaterializeInFlightAtom } from '@lib/ui';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { SessionRows } from './SessionRows.tsx';

const RECENT_LIMIT = 5;

/** Empty Virtual Chat slot: newest Sessions for this Workspace cwd. Renders inside a `List`. */
export const RecentSessions: FC = () => {
  const materializing = useAtomValue(virtualMaterializeInFlightAtom);
  const sessions = sessionsForCwd(useAtomValue(unifiedSessionHistoryAtom), useAtomValue(sessionCwdAtom)).slice(
    0,
    RECENT_LIMIT,
  );

  if (materializing || sessions.length === 0) {
    return null;
  }

  return (
    <>
      <ListItem>
        <Typography color="text.secondary" variant="subtitle2">
          Recent sessions
        </Typography>
      </ListItem>
      <SessionRows selectedSessionId={undefined} sessions={sessions} />
    </>
  );
};

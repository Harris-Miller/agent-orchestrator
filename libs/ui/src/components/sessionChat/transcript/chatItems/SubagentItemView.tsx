import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import {
  selectedSessionLaunchTargetAtom,
  selectedSubagentAtom,
  selectedSubagentRootIdAtom,
  viewedSubagentAtom,
} from '../../../../atoms/backendState.atoms.ts';
import { subagentLatestActivity } from '../../../../host/subagent.ts';
import type { ChatItemOf } from './chatItemOf.ts';
import { SubagentStatusIndicator } from './SubagentStatusIndicator.tsx';

/** A subagent Chat item in the parent transcript; click opens the Subagent view. */
export const SubagentItemView: FC<{ readonly item: ChatItemOf<'subagent'> }> = ({ item }) => {
  const child = useAtomValue(selectedSubagentAtom(item.subagentSessionId));
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const rootSessionId = useAtomValue(selectedSubagentRootIdAtom(item.subagentSessionId));
  const setViewed = useAtomSet(viewedSubagentAtom);
  if (launchTarget === undefined || rootSessionId === undefined || child === undefined) return null;
  const activity = subagentLatestActivity(child);
  return (
    <ListItem sx={{ display: 'block', py: 0.25 }}>
      <Box
        onClick={() => {
          setViewed({ childId: child.sessionId, launchTarget, rootSessionId });
        }}
        role="button"
        sx={{
          alignItems: 'center',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          cursor: 'pointer',
          display: 'flex',
          gap: 1,
          px: 1,
          py: 0.5,
        }}
      >
        <SubagentStatusIndicator child={child} />
        <Typography sx={{ fontWeight: 600 }} variant="body2">
          {child.name ?? 'Subagent'}
        </Typography>
        <Typography color="text.secondary" noWrap sx={{ flex: 1 }} variant="caption">
          {activity ?? ''}
        </Typography>
      </Box>
    </ListItem>
  );
};

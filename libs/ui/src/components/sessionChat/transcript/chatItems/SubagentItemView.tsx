import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { selectedSubagentsAtom, viewedSubagentAtom } from '../../../../atoms/backendState.atoms.ts';
import { getSubagent, rootAncestorId, subagentLatestActivity } from '../../../../host/subagent.ts';
import type { ChatItemOf } from './chatItemOf.ts';
import { SubagentStatusIndicator } from './SubagentStatusIndicator.tsx';

/** A subagent Chat item in the parent transcript; click opens the Subagent view. */
export const SubagentItemView: FC<{ readonly item: ChatItemOf<'subagent'> }> = ({ item }) => {
  const selected = useAtomValue(selectedSubagentsAtom);
  const setViewed = useAtomSet(viewedSubagentAtom);
  const child = selected === undefined ? undefined : getSubagent(selected.subagents, item.subagentSessionId);
  if (selected === undefined || child === undefined) return null;
  const { launchTarget, subagents } = selected;
  const activity = subagentLatestActivity(child);
  return (
    <ListItem sx={{ display: 'block', py: 0.25 }}>
      <Box
        onClick={() => {
          setViewed({
            childId: child.sessionId,
            launchTarget,
            rootSessionId: rootAncestorId(subagents, child.sessionId),
          });
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

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import {
  selectedSessionLaunchTargetAtom,
  selectedSubagentAtom,
  selectedSubagentConfigurationAtom,
  selectedSubagentRootIdAtom,
  viewedSubagentAtom,
} from '../../../../atoms/backendState.atoms.ts';
import { AgentLaunchTargetIcon } from '../../../AgentLaunchTargetIcon.tsx';
import { subagentLatestActivity } from '../../../../host/subagent.ts';
import type { ChatItemOf } from './chatItemOf.ts';
import { SubagentStatusIndicator } from './SubagentStatusIndicator.tsx';
import { subagentModelEffortLabel } from './subagentModelEffort.ts';

/** A subagent Chat item in the parent transcript; click opens the Subagent view. */
export const SubagentItemView: FC<{ readonly item: ChatItemOf<'subagent'> }> = ({ item }) => {
  const child = useAtomValue(selectedSubagentAtom(item.subagentSessionId));
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const configuration = useAtomValue(selectedSubagentConfigurationAtom(item.subagentSessionId));
  const rootSessionId = useAtomValue(selectedSubagentRootIdAtom(item.subagentSessionId));
  const setViewed = useAtomSet(viewedSubagentAtom);
  if (launchTarget === undefined || rootSessionId === undefined || child === undefined) return null;
  const activity = subagentLatestActivity(child);
  const childLaunchTarget = child.kind === 'spawned' ? child.launchTarget : launchTarget;
  const modelEffort =
    configuration === undefined ? undefined : subagentModelEffortLabel(childLaunchTarget, configuration);
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
        <AgentLaunchTargetIcon launchTarget={childLaunchTarget} size={14} />
        <Typography sx={{ fontWeight: 600 }} variant="body2">
          {child.name ?? 'Subagent'}
        </Typography>
        {modelEffort === undefined ? null : (
          <Typography color="text.secondary" noWrap sx={{ minWidth: 0 }} variant="caption">
            {modelEffort}
          </Typography>
        )}
        <Typography color="text.secondary" noWrap sx={{ flex: 1 }} variant="caption">
          {activity ?? ''}
        </Typography>
      </Box>
    </ListItem>
  );
};

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

import {
  selectedSessionLaunchTargetAtom,
  selectedSubagentAtom,
  selectedSubagentConfigurationAtom,
  selectedSubagentRollUpAtom,
  selectedSubagentRootIdAtom,
  viewedSubagentAtom,
} from '../../../../atoms/backendState.atoms.ts';
import { AgentLaunchTargetIcon } from '../../../AgentLaunchTargetIcon.tsx';
import type { ChatItemOf } from './chatItemOf.ts';
import { SubagentStatusIndicator } from './SubagentStatusIndicator.tsx';
import { subagentRowFields } from './subagentRowFields.ts';

/** One Subagent row (glossary): status, provider, name, Model/Effort and latest activity; click opens the Subagent view. */
export const SubagentRow: FC<{
  readonly action?: ReactNode;
  readonly childId: string;
  readonly showRollUp?: boolean;
}> = ({ action, childId, showRollUp = true }) => {
  const child = useAtomValue(selectedSubagentAtom(childId));
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const configuration = useAtomValue(selectedSubagentConfigurationAtom(childId));
  const rootSessionId = useAtomValue(selectedSubagentRootIdAtom(childId));
  const rollUp = useAtomValue(selectedSubagentRollUpAtom(childId));
  const setViewed = useAtomSet(viewedSubagentAtom);
  if (launchTarget === undefined || rootSessionId === undefined || child === undefined) return null;
  const fields = subagentRowFields(child, launchTarget, configuration);
  const showRunning = showRollUp && rollUp.running > 0;
  return (
    <Box
      onClick={() => {
        setViewed({ childId: child.sessionId, launchTarget, rootSessionId });
      }}
      role="button"
      sx={{
        alignItems: 'center',
        bgcolor: 'action.hover',
        borderRadius: 1,
        cursor: 'pointer',
        display: 'flex',
        gap: 1,
        px: 1.5,
        py: 1,
      }}
    >
      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
          {/* A descendant that needs input wins over this child's own state. */}
          <SubagentStatusIndicator child={child} needsInput={showRollUp && rollUp.needsInput} />
          <AgentLaunchTargetIcon launchTarget={fields.launchTarget} size={14} />
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {fields.name}
          </Typography>
          {fields.modelEffort === undefined ? null : (
            <Typography color="text.secondary" noWrap sx={{ minWidth: 0 }} variant="caption">
              {fields.modelEffort}
            </Typography>
          )}
          {showRunning ? (
            <Typography color="text.secondary" noWrap sx={{ flexShrink: 0 }} variant="caption">
              {rollUp.running === 1 ? '1 subagent running' : `${rollUp.running} subagents running`}
            </Typography>
          ) : null}
        </Box>
        <Typography color="text.secondary" noWrap variant="caption">
          {fields.activity ?? ''}
        </Typography>
      </Box>
      {action === undefined ? null : (
        <Box
          onClick={event => {
            event.stopPropagation();
          }}
          sx={{ flexShrink: 0 }}
        >
          {action}
        </Box>
      )}
    </Box>
  );
};

/** A subagent Chat item in the parent transcript. */
export const SubagentItemView: FC<{ readonly item: ChatItemOf<'subagent'> }> = ({ item }) => (
  <ListItem sx={{ display: 'block', py: 0.25 }}>
    <SubagentRow childId={item.subagentSessionId} />
  </ListItem>
);

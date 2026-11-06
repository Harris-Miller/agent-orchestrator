import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import {
  backendHarnessStateAtom,
  selectedSessionLaunchTargetAtom,
  viewedSubagentAtom,
} from '../../atoms/backendState.atoms.ts';
import type { InterSessionMessage } from '../../host/sessionUpdateReducer.ts';
import {
  getSubagent,
  isSubagentFinished,
  rootAncestorId,
  subagentLatestActivity,
  subagentNeedsInput,
} from '../../host/subagent.ts';
import type { SubagentSnapshot } from '../../host/subagent.ts';

export const subagentStateLabel = (
  child: SubagentSnapshot,
): { color: 'default' | 'success' | 'warning'; label: string } => {
  if (subagentNeedsInput(child)) return { color: 'warning', label: 'Needs input' };
  if (child.state === undefined) return { color: 'default', label: 'Unknown' };
  if (isSubagentFinished(child.state)) return { color: 'success', label: 'Finished' };
  return { color: 'default', label: child.state.state === 'running' ? 'Running' : child.state.state };
};

/** Inline row in the parent transcript; click opens the child's full-pane view. */
export const SubagentRow: FC<{ item: { readonly subagentSessionId: string } }> = ({ item }) => {
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom) ?? 'codex-acp';
  const { subagents } = useAtomValue(backendHarnessStateAtom(launchTarget));
  const child = getSubagent(subagents, item.subagentSessionId);
  const setViewed = useAtomSet(viewedSubagentAtom);
  if (child === undefined) return null;
  const chip = subagentStateLabel(child);
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
        <Typography sx={{ fontWeight: 600 }} variant="body2">
          {child.name ?? 'Subagent'}
        </Typography>
        <Chip color={chip.color} label={chip.label} size="small" variant="outlined" />
        <Typography color="text.secondary" noWrap sx={{ flex: 1 }} variant="caption">
          {activity ?? ''}
        </Typography>
      </Box>
    </ListItem>
  );
};

export const InterSessionMessageRow: FC<{ item: InterSessionMessage }> = ({ item }) => {
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom) ?? 'codex-acp';
  const { subagents } = useAtomValue(backendHarnessStateAtom(launchTarget));
  const nameOf = (id: string | undefined) =>
    id === undefined ? undefined : (getSubagent(subagents, id)?.name ?? 'session');
  const to = nameOf(item.recipientSessionId);
  const from = nameOf(item.senderSessionId);
  const caption = to === undefined ? `From ${from ?? 'another session'} · inter-session message` : `To ${to}`;
  return (
    <ListItem sx={{ display: 'block', py: 0.25 }}>
      <Box sx={{ borderLeft: 3, borderColor: 'divider', pl: 1 }}>
        <Typography color="text.secondary" variant="caption">
          {caption}
        </Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap' }} variant="body2">
          {item.text}
        </Typography>
      </Box>
    </ListItem>
  );
};

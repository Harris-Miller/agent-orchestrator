import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { selectedSubagentsAtom } from '../../../../atoms/backendState.atoms.ts';
import { getSubagent } from '../../../../host/subagent.ts';
import type { ChatItemOf } from './chatItemOf.ts';

export const InterSessionMessageView: FC<{ readonly item: ChatItemOf<'inter_session_message'> }> = ({ item }) => {
  const subagents = useAtomValue(selectedSubagentsAtom)?.subagents ?? {};
  const nameOf = (id: string | undefined) =>
    id === undefined ? undefined : (getSubagent(subagents, id)?.name ?? 'another session');
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

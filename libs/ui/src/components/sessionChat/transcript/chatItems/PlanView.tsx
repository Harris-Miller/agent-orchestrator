import Chip from '@mui/material/Chip';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { ChatItemOf } from './chatItemOf.ts';

const statusColor = (status: string | undefined): 'default' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'cancelled':
      return 'default';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'info';
    case 'pending':
      return 'warning';
    case undefined:
    default:
      return 'default';
  }
};

export const PlanView: FC<{ readonly item: ChatItemOf<'plan'> }> = ({ item }) => (
  <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
    <Typography sx={{ fontWeight: 600, mb: 1 }} variant="body2">
      Plan
    </Typography>
    <Stack spacing={1}>
      {item.entries.map(entry => (
        <Paper key={`${item.id}-${entry.content}`} sx={{ p: 1.5 }} variant="outlined">
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ flex: 1 }} variant="body2">
              {entry.content}
            </Typography>
            {entry.status !== undefined ? (
              <Chip color={statusColor(entry.status)} label={entry.status} size="small" variant="outlined" />
            ) : null}
            {entry.priority !== undefined ? <Chip label={entry.priority} size="small" variant="outlined" /> : null}
          </Stack>
        </Paper>
      ))}
    </Stack>
  </ListItem>
);

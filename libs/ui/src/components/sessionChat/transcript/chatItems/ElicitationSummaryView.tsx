import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { ChatItemOf } from './chatItemOf.ts';

export const ElicitationSummaryView: FC<{ readonly item: ChatItemOf<'elicitation_summary'> }> = ({ item }) => (
  <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
    <Paper sx={{ p: 1.5 }} variant="outlined">
      <Typography color="text.secondary" variant="caption">
        You answered
      </Typography>
      <Typography gutterBottom variant="body2">
        {item.message}
      </Typography>
      <Stack spacing={1}>
        {item.rows.map(row => (
          <div key={`${row.label}-${row.value}`}>
            {row.caption === undefined ? null : (
              <Typography color="text.secondary" sx={{ display: 'block' }} variant="caption">
                {row.caption}
              </Typography>
            )}
            <Typography variant="body2">{row.label}</Typography>
            <Typography sx={{ fontWeight: 600 }} variant="body2">
              {row.value}
            </Typography>
            {row.note === undefined ? null : (
              <Typography color="text.secondary" variant="body2">
                {row.note}
              </Typography>
            )}
          </div>
        ))}
      </Stack>
    </Paper>
  </ListItem>
);

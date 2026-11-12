import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { ChatItemOf } from './chatItemOf.ts';

export const RequestErrorView: FC<{ readonly item: ChatItemOf<'request_error'> }> = ({ item }) => (
  <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
    <Alert severity="error" variant="outlined">
      <AlertTitle>{`${item.method} failed (${String(item.code)})`}</AlertTitle>
      {item.message}
      {item.details === undefined ? null : (
        <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="body2">
          {item.details}
        </Typography>
      )}
    </Alert>
  </ListItem>
);

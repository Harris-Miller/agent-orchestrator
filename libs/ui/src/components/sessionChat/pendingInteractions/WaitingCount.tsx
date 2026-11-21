import Typography from '@mui/material/Typography';
import type { FC } from 'react';

/** "N more waiting" above a Pending interaction card: requests of the same kind queued behind the one shown. */
export const WaitingCount: FC<{ readonly count: number }> = ({ count }) =>
  count === 0 ? null : (
    <Typography color="text.secondary" component="p" sx={{ mb: 0.5 }} variant="caption">
      {count} more waiting
    </Typography>
  );

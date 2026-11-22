import Typography from '@mui/material/Typography';
import type { FC } from 'react';

/** The current page's title, shown under the app title in a page's rail. */
export const PageTitle: FC<{ readonly children: string }> = ({ children }) => (
  <Typography sx={{ flexShrink: 0, fontWeight: 600, px: 2 }} variant="h2">
    {children}
  </Typography>
);

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

/** Left-of-control plain-text label (desktop chrome — not floating InputLabel). Owns the row. */
export const FieldLabel: FC<{
  readonly children: ReactNode;
  readonly fullWidth?: boolean;
  readonly htmlFor?: string;
  readonly id?: string;
  readonly label: ReactNode;
}> = ({ children, fullWidth = false, htmlFor, id, label }) => (
  <Stack
    direction="row"
    spacing={1}
    sx={{ alignItems: 'center', ...(fullWidth ? { width: '100%' } : null) }}
    useFlexGap
  >
    <Typography component="label" htmlFor={htmlFor} id={id} sx={{ flexShrink: 0 }} variant="body2">
      {label}
    </Typography>
    {fullWidth ? <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box> : children}
  </Stack>
);

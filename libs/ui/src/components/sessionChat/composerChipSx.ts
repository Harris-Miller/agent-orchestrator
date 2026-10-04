import type { SxProps, Theme } from '@mui/material/styles';

/** Shared monospace pill look for composer and user-transcript command / markdown-link chips. */
export const sharedChipSx = {
  bgcolor: 'action.selected',
  borderRadius: 1,
  display: 'inline',
  fontFamily: 'monospace',
  fontSize: '0.8125rem',
  fontWeight: 600,
  mx: '1px',
  px: 0.75,
  py: 0.15,
  userSelect: 'none',
  whiteSpace: 'nowrap',
} as const satisfies SxProps<Theme>;

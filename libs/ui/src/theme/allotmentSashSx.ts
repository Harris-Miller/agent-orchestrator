import type { Theme } from '@mui/material/styles';

/**
 * Allotment paints hover on ::before via --focus-border / --sash-hover-size.
 * Do not set .sash-hover backgroundColor — that fills the full --sash-size (8px) hit target.
 */
export const allotmentSashSx = (theme: Theme) => ({
  '--focus-border': theme.palette.primary.main,
  '--sash-hover-size': '3px',
  '--separator-border': 'transparent',
  '& .split-view-separator-border > .split-view-container > .split-view-view:not(:first-of-type)::before': {
    backgroundColor: 'transparent',
  },
});

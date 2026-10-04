import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

/** Shared layout for composer / transcript chips (chrome lives on ComposerChipContent only). */
export const baseChipSx = {
  alignItems: 'center',
  border: 'none',
  borderRadius: '4px',
  display: 'inline-flex',
  // Match adjacent editor/transcript type — monospace reads larger than Lato at the same em.
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  gap: 0.375,
  lineHeight: 1,
  mx: '0.15em',
  px: 0.5,
  py: '0.05em',
  userSelect: 'none',
  // baseline (not middle): parent line-height 1.43 puts glyphs low in the line box;
  // middle centers the chip in that box and leaves chip text sitting high.
  verticalAlign: 'baseline',
  whiteSpace: 'nowrap',
} as const satisfies SxProps<Theme>;

export const commandChipSx = {
  ...baseChipSx,
  bgcolor: (theme: Theme) => alpha(theme.palette.secondary.main, 0.08),
  color: 'secondary.main',
} as const satisfies SxProps<Theme>;

export const markdownLinkChipSx = {
  ...baseChipSx,
  bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.08),
  color: 'primary.main',
} as const satisfies SxProps<Theme>;

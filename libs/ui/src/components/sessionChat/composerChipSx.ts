import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

/** Shared layout for composer / transcript chips (chrome lives on ComposerChipContent only). */
export const baseChipSx = {
  border: 'none',
  borderRadius: '4px',
  // inline-block (not inline-flex): baseline comes from the label text. inline-flex lets a
  // leading file icon (replaced element) own the baseline and float the pill.
  display: 'inline-block',
  // Match adjacent editor/transcript type — monospace reads larger than Lato at the same em.
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  lineHeight: 1,
  mx: '0.15em',
  px: 0.5,
  py: '0.05em',
  userSelect: 'none',
  verticalAlign: 'baseline',
  whiteSpace: 'nowrap',
} as const satisfies SxProps<Theme>;

export const commandChipSx = {
  ...baseChipSx,
  bgcolor: (theme: Theme) => theme.palette.commandChip?.background ?? alpha(theme.palette.secondary.main, 0.08),
  color: (theme: Theme) => theme.palette.commandChip?.foreground ?? theme.palette.secondary.main,
} as const satisfies SxProps<Theme>;

export const markdownLinkChipSx = {
  ...baseChipSx,
  bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.08),
  color: 'primary.main',
} as const satisfies SxProps<Theme>;

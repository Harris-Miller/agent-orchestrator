import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

/** Shared layout for composer / transcript chips (chrome lives on ComposerChipContent only). */
export const baseChipSx = {
  alignItems: 'center',
  border: '1px solid',
  borderRadius: 1,
  display: 'inline-flex',
  fontFamily: 'monospace',
  fontSize: 'inherit',
  fontWeight: 600,
  gap: 0.25,
  lineHeight: 1,
  mx: '1px',
  px: 0.5,
  py: 0,
  userSelect: 'none',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
} as const satisfies SxProps<Theme>;

export const commandChipSx = {
  ...baseChipSx,
  bgcolor: (theme: Theme) => alpha(theme.palette.secondary.main, 0.08),
  borderColor: 'secondary.main',
  color: 'secondary.main',
} as const satisfies SxProps<Theme>;

export const markdownLinkChipSx = {
  ...baseChipSx,
  bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.08),
  borderColor: 'primary.main',
  color: 'primary.main',
} as const satisfies SxProps<Theme>;

export const chipSxForKind = (kind: 'command' | 'markdownLink'): SxProps<Theme> =>
  kind === 'command' ? commandChipSx : markdownLinkChipSx;

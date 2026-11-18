import type { SxProps, Theme } from '@mui/material/styles';

/** Shared look of the Composer surface; the Subagent dock mirrors it. */
export const composerPaperSx = {
  bgcolor: theme => theme.palette.composerBackground,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 3,
  boxShadow: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  p: 1.5,
} satisfies SxProps<Theme>;

/** Wrapping row of Config chips under the editor. */
export const composerChipRowSx = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 0.5,
} satisfies SxProps<Theme>;

/** Render a string with fzf match indices emphasized (and optional bold tail). */
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import type { FC, ReactNode } from 'react';

import { fzfHighlightRuns } from './fzfHighlightRuns.ts';

export type HighlightFzfCharsProps = {
  /** Inclusive start index for bold styling (e.g. basename). */
  readonly boldFrom?: number;
  readonly positions: ReadonlySet<number>;
  readonly text: string;
};

const highlightSx: SxProps<Theme> = {
  bgcolor: theme => alpha(theme.palette.warning.main, 0.28),
  borderRadius: 0.25,
  fontWeight: 700,
};

const boldSx: SxProps<Theme> = { fontWeight: 700 };

export const HighlightFzfChars: FC<HighlightFzfCharsProps> = ({ boldFrom, positions, text }) => {
  if (positions.size === 0 && boldFrom === undefined) {
    return text.normalize();
  }
  const nodes: ReactNode[] = fzfHighlightRuns(text, positions, boldFrom).map(run =>
    run.highlighted || run.bold ? (
      <Box component="span" key={`fzf-${String(run.start)}`} sx={run.highlighted ? highlightSx : boldSx}>
        {run.text}
      </Box>
    ) : (
      run.text
    ),
  );
  return nodes;
};

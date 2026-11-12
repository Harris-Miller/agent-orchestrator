import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { FC } from 'react';

import { commandChipSx, markdownLinkChipSx } from './composerChipSx.ts';
import { FileChipIconView } from '../../fileChipIcons/FileChipIconView.tsx';

type ComposerChipSharedProps = {
  readonly className?: string;
  readonly label: string;
  readonly sx?: SxProps<Theme>;
  readonly testId?: string;
};

export type ComposerChipContentProps =
  | ({ readonly href?: string; readonly kind: 'markdownLink' } & ComposerChipSharedProps)
  | ({ readonly kind: 'command' } & ComposerChipSharedProps);

export const ComposerChipContent: FC<ComposerChipContentProps> = props => {
  const { className, kind, label, sx, testId } = props;
  const kindSx = kind === 'command' ? commandChipSx : markdownLinkChipSx;
  // MUI SxProps array typing rejects `as const` kind objects + optional override without a cast.
  const mergedSx = (sx === undefined ? kindSx : [kindSx, sx]) as SxProps<Theme>;
  return (
    <Box className={className} component="span" contentEditable={false} data-testid={testId} sx={mergedSx}>
      {kind === 'markdownLink' ? (
        <FileChipIconView href={props.href} label={label} sx={{ marginRight: '0.25em' }} />
      ) : null}
      {label}
    </Box>
  );
};

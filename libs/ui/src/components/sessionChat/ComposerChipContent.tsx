import { useAtomValue } from '@effect/atom-react';
import Extension from '@mui/icons-material/Extension';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { FC } from 'react';

import { themeAtom } from '../../atoms/boundHarnessAtoms.ts';

import { commandChipSx, markdownLinkChipSx } from './composerChipSx.ts';
import { resolveFileChipIcon } from './fileChipIcons/resolveFileChipIcon.ts';

const iconSx = { flexShrink: 0, fontSize: '0.875em', height: '0.875em', width: '0.875em' } as const;

export type ComposerChipContentProps = {
  readonly className?: string;
  readonly href?: string;
  readonly kind: 'command' | 'markdownLink';
  readonly label: string;
  readonly sx?: SxProps<Theme>;
  readonly testId?: string;
};

const MarkdownLinkChipIcon: FC<{ readonly href?: string; readonly label: string }> = ({ href, label }) => {
  const themeId = useAtomValue(themeAtom);
  const icon = resolveFileChipIcon({ href, label }, themeId);
  if (icon.kind === 'mui') {
    const { Icon } = icon;
    return <Icon sx={iconSx} />;
  }
  return <Box alt="" component="img" src={icon.url} sx={{ ...iconSx, display: 'block' }} />;
};

export const ComposerChipContent: FC<ComposerChipContentProps> = ({ className, href, kind, label, sx, testId }) => {
  const kindSx = kind === 'command' ? commandChipSx : markdownLinkChipSx;
  // MUI SxProps array typing rejects `as const` kind objects + optional override without a cast.
  const mergedSx = (sx === undefined ? kindSx : [kindSx, sx]) as SxProps<Theme>;
  return (
    <Box className={className} component="span" contentEditable={false} data-testid={testId} sx={mergedSx}>
      {kind === 'command' ? <Extension sx={iconSx} /> : <MarkdownLinkChipIcon href={href} label={label} />}
      {label}
    </Box>
  );
};

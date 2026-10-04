import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { FC } from 'react';

import { themeAtom } from '../../atoms/boundHarnessAtoms.ts';

import { commandChipSx, markdownLinkChipSx } from './composerChipSx.ts';
import { resolveFileChipIcon } from './fileChipIcons/resolveFileChipIcon.ts';

const iconSx = {
  display: 'inline-block',
  fontSize: '0.875em',
  height: '0.875em',
  marginRight: '0.25em',
  verticalAlign: 'middle',
  width: '0.875em',
} as const;

type ComposerChipSharedProps = {
  readonly className?: string;
  readonly label: string;
  readonly sx?: SxProps<Theme>;
  readonly testId?: string;
};

export type ComposerChipContentProps =
  | ({ readonly href?: string; readonly kind: 'markdownLink' } & ComposerChipSharedProps)
  | ({ readonly kind: 'command' } & ComposerChipSharedProps);

const MarkdownLinkChipIcon: FC<{ readonly href?: string; readonly label: string }> = ({ href, label }) => {
  const themeId = useAtomValue(themeAtom);
  const icon = resolveFileChipIcon({ href, label }, themeId);
  if (icon.kind === 'mui') {
    const { Icon } = icon;
    return <Icon sx={iconSx} />;
  }
  return <Box alt="" component="img" src={icon.url} sx={iconSx} />;
};

export const ComposerChipContent: FC<ComposerChipContentProps> = props => {
  const { className, kind, label, sx, testId } = props;
  const kindSx = kind === 'command' ? commandChipSx : markdownLinkChipSx;
  // MUI SxProps array typing rejects `as const` kind objects + optional override without a cast.
  const mergedSx = (sx === undefined ? kindSx : [kindSx, sx]) as SxProps<Theme>;
  return (
    <Box className={className} component="span" contentEditable={false} data-testid={testId} sx={mergedSx}>
      {kind === 'markdownLink' ? <MarkdownLinkChipIcon href={props.href} label={label} /> : null}
      {label}
    </Box>
  );
};

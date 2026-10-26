/** Theme-aware file/folder/link icon used by chips and FS listing rows. */
import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { FC } from 'react';

import { themeAtom } from '../../atoms/boundHarnessAtoms.ts';
import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';
import { LucideIcon } from '../LucideIcon.tsx';

import { resolveFileChipIcon } from './fileChipIcons/resolveFileChipIcon.ts';

const defaultIconSx = {
  display: 'inline-block',
  flexShrink: 0,
  fontSize: '0.875em',
  height: '0.875em',
  verticalAlign: 'middle',
  width: '0.875em',
} as const;

export type FileChipIconViewProps = {
  readonly href?: string;
  readonly label: string;
  readonly sx?: SxProps<Theme>;
};

export const FileChipIconView: FC<FileChipIconViewProps> = ({ href, label, sx }) => {
  const themeId = useAtomValue(themeAtom);
  const icon = resolveFileChipIcon({ href, label }, themeId);
  const mergedSx = sx === undefined ? defaultIconSx : ([defaultIconSx, sx] as SxProps<Theme>);
  if (icon.kind === 'lucide') {
    return <LucideIcon icon={icon.Icon} sx={mergedSx} />;
  }
  return <Box alt="" component="img" src={icon.url} sx={mergedSx} />;
};

/** Icon for a cached `@` FS listing entry (dirs keep trailing `/` for folder glyph). */
export const ListingEntryIcon: FC<{
  readonly entry: FdListingEntry;
  readonly sx?: SxProps<Theme>;
}> = ({ entry, sx }) => {
  const name = listingBasename(entry.path);
  return <FileChipIconView href={entry.path} label={`@${name}`} sx={sx} />;
};

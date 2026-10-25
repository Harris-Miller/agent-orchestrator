/** Theme-aware file/folder/link icon used by chips and FS listing rows. */
import { useAtomValue } from '@effect/atom-react';
import { cn } from 'cn';
import { Link2Icon } from 'lucide-react';
import type { FC } from 'react';

import { themeAtom } from '../../atoms/boundHarnessAtoms.ts';
import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';

import { resolveFileChipIcon } from './fileChipIcons/resolveFileChipIcon.ts';

export type FileChipIconViewProps = {
  readonly className?: string;
  readonly href?: string;
  readonly label: string;
};

export const FileChipIconView: FC<FileChipIconViewProps> = ({ className, href, label }) => {
  const themeId = useAtomValue(themeAtom);
  const icon = resolveFileChipIcon({ href, label }, themeId);
  const classes = cn('inline-block size-[0.875em] shrink-0 align-middle', className);
  if (icon.kind === 'link') {
    return <Link2Icon aria-hidden className={classes} />;
  }
  return <img alt="" className={classes} src={icon.url} />;
};

/** Icon for a cached `@` FS listing entry (dirs keep trailing `/` for folder glyph). */
export const ListingEntryIcon: FC<{
  readonly className?: string;
  readonly entry: FdListingEntry;
}> = ({ className, entry }) => {
  const name = listingBasename(entry.path);
  return <FileChipIconView className={className} href={entry.path} label={`@${name}`} />;
};

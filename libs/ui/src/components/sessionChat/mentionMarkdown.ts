/** Pure helpers for composer `@` mention markdown insertion. */
import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';

import { markdownLinkText } from './ComposerMarkdownLinkNode.tsx';

/** Absolute `[basename](path)` for a listing hit under session cwd (dirs keep trailing `/`). */
export const mentionMarkdownForEntry = (cwd: string, entry: FdListingEntry): string => {
  const relative = entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path;
  const cwdNormalized = cwd.endsWith('/') || cwd.endsWith('\\') ? cwd.slice(0, -1) : cwd;
  const sep = cwdNormalized.includes('\\') && !cwdNormalized.includes('/') ? '\\' : '/';
  const absolute =
    relative.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relative)
      ? relative
      : `${cwdNormalized}${sep}${relative.replaceAll('/', sep)}`;
  const href =
    entry.kind === 'dir' ? (absolute.endsWith('/') || absolute.endsWith('\\') ? absolute : `${absolute}/`) : absolute;
  return markdownLinkText(listingBasename(entry.path), href);
};

/** Pure helpers for composer `@` mention markdown insertion. */
import type { FdListingEntry } from '../../../../host/fdListing.ts';
import { listingBasename } from '../../../../host/fdListing.ts';

import { markdownLinkText } from '../../chips/markdownLinkText.ts';

/** Absolute FS path → `file://` href (matches ACP session/load replay). */
export const absolutePathToFileUrlHref = (absolutePath: string): string => {
  if (absolutePath.startsWith('file://')) {
    return absolutePath;
  }
  const asPosix = absolutePath.replaceAll('\\', '/');
  if (/^[A-Za-z]:\//.test(asPosix)) {
    return `file:///${asPosix}`;
  }
  if (asPosix.startsWith('/')) {
    return `file://${asPosix}`;
  }
  return `file:///${asPosix}`;
};

/** `[@"basename"](file:///abs)` — same shape Codex/Claude echo on session/load. */
export const fsMentionMarkdownLink = (basename: string, absolutePath: string): string => {
  const label = basename.startsWith('@') ? basename : `@${basename}`;
  return markdownLinkText(label, absolutePathToFileUrlHref(absolutePath));
};

/** Absolute path for a listing hit under session cwd (dirs keep trailing `/`). */
export const absolutePathForMentionEntry = (cwd: string, entry: FdListingEntry): string => {
  const relative = entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path;
  const cwdNormalized = cwd.endsWith('/') || cwd.endsWith('\\') ? cwd.slice(0, -1) : cwd;
  const sep = cwdNormalized.includes('\\') && !cwdNormalized.includes('/') ? '\\' : '/';
  const absolute =
    relative.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relative)
      ? relative
      : `${cwdNormalized}${sep}${relative.replaceAll('/', sep)}`;
  if (entry.kind !== 'dir') {
    return absolute;
  }
  return absolute.endsWith('/') || absolute.endsWith('\\') ? absolute : `${absolute}/`;
};

/** Absolute `[@basename](file://path)` for a listing hit under session cwd (dirs keep trailing `/`). */
export const mentionMarkdownForEntry = (cwd: string, entry: FdListingEntry): string =>
  fsMentionMarkdownLink(listingBasename(entry.path), absolutePathForMentionEntry(cwd, entry));

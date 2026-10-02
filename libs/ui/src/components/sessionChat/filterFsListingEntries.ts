/** Fzf-filter session FS listing entries for the composer `@` menu (display cap 50). */
import { Fzf } from 'fzf';

import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';

export const MENTION_MENU_LIMIT = 50;

const fzfFind = (entries: readonly FdListingEntry[], query: string): readonly FdListingEntry[] =>
  new Fzf(entries, { selector: entry => entry.path }).find(query).map(result => result.item);

/**
 * Filter cached FS entries for `@` query. Empty query lists all (capped);
 * non-empty: exact basename matches first, then fzf path hits. Display capped at 50.
 */
export const filterFsListingEntries = (
  entries: readonly FdListingEntry[],
  query: string,
): readonly FdListingEntry[] => {
  if (entries.length === 0) {
    return [];
  }
  if (query.length === 0) {
    return entries.slice(0, MENTION_MENU_LIMIT);
  }

  const exact = entries.filter(entry => listingBasename(entry.path) === query);
  const remaining = entries.filter(entry => listingBasename(entry.path) !== query);
  const fuzzy = fzfFind(remaining, query);
  return [...exact, ...fuzzy].slice(0, MENTION_MENU_LIMIT);
};

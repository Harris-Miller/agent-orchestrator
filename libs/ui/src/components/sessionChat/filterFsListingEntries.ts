/** Fzf-filter session FS listing entries for the composer `@` menu. */
import { Fzf } from 'fzf';

import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';

const EMPTY_POSITIONS: ReadonlySet<number> = new Set();

export type FsListingMatch = {
  readonly entry: FdListingEntry;
  readonly positions: ReadonlySet<number>;
};

/** Character indices of the basename within `entry.path` (for exact-query highlight). */
export const basenameMatchPositions = (entry: FdListingEntry): ReadonlySet<number> => {
  const name = listingBasename(entry.path);
  if (name.length === 0) {
    return EMPTY_POSITIONS;
  }
  const start = entry.path.endsWith('/') ? entry.path.length - name.length - 1 : entry.path.length - name.length;
  if (start < 0) {
    return EMPTY_POSITIONS;
  }
  const positions = new Set<number>();
  for (let index = 0; index < name.length; index += 1) {
    positions.add(start + index);
  }
  return positions;
};

/**
 * Filter cached FS entries for `@` query, keeping fzf match positions.
 * Empty query lists all (no positions); non-empty: exact basename matches first
 * (basename positions), then fzf path hits.
 */
export const filterFsListingMatchesAll = (
  entries: readonly FdListingEntry[],
  query: string,
): readonly FsListingMatch[] => {
  if (entries.length === 0) {
    return [];
  }
  if (query.length === 0) {
    return entries.map(entry => ({ entry, positions: EMPTY_POSITIONS }));
  }

  const exact = entries
    .filter(entry => listingBasename(entry.path) === query)
    .map((entry): FsListingMatch => ({ entry, positions: basenameMatchPositions(entry) }));
  const remaining = entries.filter(entry => listingBasename(entry.path) !== query);
  const fuzzy = new Fzf(remaining, { selector: entry => entry.path })
    .find(query)
    .map((result): FsListingMatch => ({ entry: result.item, positions: result.positions }));
  return [...exact, ...fuzzy];
};

/**
 * Filter cached FS entries for `@` query. Empty query lists all;
 * non-empty: exact basename matches first, then fzf path hits. No display cap
 * (composer menu virtualizes the full result set).
 */
export const filterFsListingEntries = (entries: readonly FdListingEntry[], query: string): readonly FdListingEntry[] =>
  filterFsListingMatchesAll(entries, query).map(match => match.entry);

import { Fzf } from 'fzf';

import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { isArchivedEntry } from '../../host/airMeta.ts';

export const filterSessionHistoryMatches = (entries: readonly UnifiedHistoryEntry[], query: string) => {
  const matches = new Fzf(entries, { selector: entry => entry.title ?? 'New Session' })
    .find(query)
    .map(result => ({ entry: result.item, positions: result.positions }));
  return [
    ...matches.filter(match => !isArchivedEntry(match.entry)),
    ...matches.filter(match => isArchivedEntry(match.entry)),
  ];
};

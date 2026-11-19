import type { SessionIndexEntry } from '@lib/hoa-home';

import type { HistoryEntry } from './acpSessionBootstrap.ts';

/** Rows of Session History grouped under each listed cwd (every listed cwd gets a key, so an emptied one is cleared). */
export const indexRowsByCwd = (
  history: readonly HistoryEntry[],
  listedCwds: readonly string[],
): Record<string, readonly SessionIndexEntry[]> => {
  const byCwd: Record<string, SessionIndexEntry[]> = Object.fromEntries(listedCwds.map(cwd => [cwd, []]));
  for (const { unavailable: _unavailable, ...entry } of history) {
    byCwd[entry.cwd]?.push(entry);
  }
  return byCwd;
};

import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { sessionEntryKey } from '../../host/sessionEntryKey.ts';

/** The selected keys that still name a visible entry (deleted or hidden entries drop out). */
export const pruneSelection = (
  selectedKeys: ReadonlySet<string>,
  visibleEntries: readonly UnifiedHistoryEntry[],
): ReadonlySet<string> => {
  const visibleKeys = new Set(visibleEntries.map(sessionEntryKey));
  return new Set([...selectedKeys].filter(key => visibleKeys.has(key)));
};

export const toggleKey = (keys: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  const next = new Set(keys);
  if (!next.delete(key)) next.add(key);
  return next;
};

export const selectAllKeys = (entries: readonly UnifiedHistoryEntry[]): ReadonlySet<string> =>
  new Set(entries.map(sessionEntryKey));

/**
 * Which Bulk actions fit the selection: Archive to unarchived entries, Unarchive to archived ones (both only for
 * entries whose agent can archive), Delete to all.
 */
export const partitionForBulk = (
  selectedEntries: readonly UnifiedHistoryEntry[],
  canArchive: (entry: UnifiedHistoryEntry) => boolean,
): {
  readonly all: readonly UnifiedHistoryEntry[];
  readonly archivable: readonly UnifiedHistoryEntry[];
  readonly unarchivable: readonly UnifiedHistoryEntry[];
} => ({
  all: selectedEntries,
  archivable: selectedEntries.filter(entry => canArchive(entry) && entry.archived !== true),
  unarchivable: selectedEntries.filter(entry => canArchive(entry) && entry.archived === true),
});

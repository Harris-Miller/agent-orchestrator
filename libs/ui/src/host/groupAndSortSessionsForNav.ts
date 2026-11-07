/**
 * Desktop Sessions panel grouping: exact-cwd groups plus a shared No Folder bucket.
 * VS Code Session History does not group; it uses {@link sessionsForCwd} for the Workspace cwd.
 */

import { compareHistoryEntries } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo } from './acpSessionBootstrap.ts';
import { directoryBasename } from './directoryBasename.ts';
import { isNoFolderSessionCwd } from './noFolderSessionCwd.ts';

export type NavSessionGroup<T extends NormalizedSessionInfo = NormalizedSessionInfo> =
  | { readonly cwd: string; readonly kind: 'cwd'; readonly sessions: readonly T[] }
  | { readonly kind: 'noFolder'; readonly sessions: readonly T[] };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const navSessionGroupStableKey = <T extends NormalizedSessionInfo>(group: NavSessionGroup<T>): string =>
  group.kind === 'cwd' ? group.cwd : 'noFolder';

/**
 * Group history for desktop nav: No Folder sessions collapse into one group; others by
 * exact cwd; sessions within a group in Session History order. Cwd groups sort alphabetically by directory name (case-insensitive, numeric), tie-break full cwd; No Folder last.
 */
export const groupAndSortSessionsForNav = <T extends NormalizedSessionInfo>(
  history: readonly T[],
): readonly NavSessionGroup<T>[] => {
  const noFolderSessions: T[] = [];
  const cwdGroups = new Map<string, T[]>();

  for (const entry of history) {
    if (isNoFolderSessionCwd(entry.cwd)) {
      noFolderSessions.push(entry);
    } else {
      const existing = cwdGroups.get(entry.cwd);
      if (existing === undefined) {
        cwdGroups.set(entry.cwd, [entry]);
      } else {
        existing.push(entry);
      }
    }
  }

  const groups: (NavSessionGroup<T> & { readonly kind: 'cwd' })[] = [...cwdGroups.entries()].map(([cwd, sessions]) => ({
    cwd,
    kind: 'cwd' as const,
    sessions: [...sessions].sort(compareHistoryEntries),
  }));

  groups.sort(
    (left, right) =>
      collator.compare(directoryBasename(left.cwd), directoryBasename(right.cwd)) ||
      (left.cwd < right.cwd ? -1 : left.cwd > right.cwd ? 1 : 0),
  );

  return noFolderSessions.length > 0
    ? [...groups, { kind: 'noFolder', sessions: [...noFolderSessions].sort(compareHistoryEntries) }]
    : groups;
};

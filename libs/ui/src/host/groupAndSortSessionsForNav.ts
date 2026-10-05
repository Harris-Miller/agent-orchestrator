/**
 * Desktop Sessions panel grouping: exact-cwd groups plus a shared No Folder bucket.
 * Does not replace {@link groupAndSortSessionsByCwd} (VS Code Session History).
 */

import { compareRosterEntriesByUpdatedAtDesc } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo } from './acpSessionBootstrap.ts';
import { isNoFolderSessionCwd } from './noFolderSessionCwd.ts';

export type NavSessionGroup<T extends NormalizedSessionInfo = NormalizedSessionInfo> =
  | { readonly cwd: string; readonly kind: 'cwd'; readonly sessions: readonly T[] }
  | { readonly kind: 'noFolder'; readonly sessions: readonly T[] };

const maxUpdatedAtMs = (sessions: readonly Pick<NormalizedSessionInfo, 'updatedAt'>[]): number => {
  let max = Number.NEGATIVE_INFINITY;
  for (const entry of sessions) {
    if (entry.updatedAt !== undefined) {
      const parsed = Date.parse(entry.updatedAt);
      if (Number.isFinite(parsed) && parsed > max) {
        max = parsed;
      }
    }
  }
  return max;
};

const groupStableKey = <T extends NormalizedSessionInfo>(group: NavSessionGroup<T>): string =>
  group.kind === 'cwd' ? group.cwd : 'noFolder';

/**
 * Group roster for desktop nav: No Folder sessions collapse into one group; others by
 * exact cwd. Sort groups by max session `updatedAt` desc, then stable key.
 */
export const groupAndSortSessionsForNav = <T extends NormalizedSessionInfo>(
  roster: readonly T[],
): readonly NavSessionGroup<T>[] => {
  const noFolderSessions: T[] = [];
  const cwdGroups = new Map<string, T[]>();

  for (const entry of roster) {
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

  const groups: NavSessionGroup<T>[] = [...cwdGroups.entries()].map(([cwd, sessions]) => ({
    cwd,
    kind: 'cwd' as const,
    sessions: [...sessions].sort(compareRosterEntriesByUpdatedAtDesc),
  }));

  if (noFolderSessions.length > 0) {
    groups.push({
      kind: 'noFolder',
      sessions: [...noFolderSessions].sort(compareRosterEntriesByUpdatedAtDesc),
    });
  }

  return groups.sort((left, right) => {
    const leftMax = maxUpdatedAtMs(left.sessions);
    const rightMax = maxUpdatedAtMs(right.sessions);
    if (leftMax !== rightMax) {
      return rightMax - leftMax;
    }
    const leftKey = groupStableKey(left);
    const rightKey = groupStableKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
};

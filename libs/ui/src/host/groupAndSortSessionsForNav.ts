/**
 * Desktop Sessions panel grouping: one group per Project (exact cwd), always present even with no rows.
 * Rows whose cwd is not a Project are not grouped. VS Code Session History does not group; it uses
 * {@link sessionsForCwd} for the Workspace cwd.
 */

import { compareHistoryEntries } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo } from './acpSessionBootstrap.ts';
import { directoryBasename } from './directoryBasename.ts';

export type NavSessionGroup<T extends NormalizedSessionInfo = NormalizedSessionInfo> = {
  readonly cwd: string;
  readonly sessions: readonly T[];
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const navSessionGroupStableKey = <T extends NormalizedSessionInfo>(group: NavSessionGroup<T>): string =>
  group.cwd;

/**
 * Group history for desktop nav by Project; sessions within a group in Session History order.
 * Groups sort alphabetically by directory name (case-insensitive, numeric), tie-break full cwd.
 */
export const groupAndSortSessionsForNav = <T extends NormalizedSessionInfo>(
  history: readonly T[],
  projects: readonly string[],
): readonly NavSessionGroup<T>[] => {
  const byCwd = new Map<string, T[]>(projects.map(cwd => [cwd, []]));
  for (const entry of history) {
    byCwd.get(entry.cwd)?.push(entry);
  }
  return [...byCwd.entries()]
    .map(([cwd, sessions]) => ({ cwd, sessions: [...sessions].sort(compareHistoryEntries) }))
    .sort(
      (left, right) =>
        collator.compare(directoryBasename(left.cwd), directoryBasename(right.cwd)) ||
        (left.cwd < right.cwd ? -1 : left.cwd > right.cwd ? 1 : 0),
    );
};

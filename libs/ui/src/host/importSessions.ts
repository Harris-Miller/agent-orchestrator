/**
 * Import state, pure: per-launch-target paging cursors of one open Import and the rows merged from their pages.
 * `session/list` runs only from here; each launch target has its own cursor, rows from all of them are merged by
 * `(launchTarget, sessionId)` and shown newest Last prompt time first.
 */
import type { ListSessionsResponse } from '@libs/effect-acp';

import { compareHistoryEntriesByLastPromptDesc, normalizeSessionHistory } from './acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from './acpSessionBootstrap.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from './agentLaunchTarget.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { MAX_LIST_PAGES } from './listSessionPages.ts';
import { sessionEntryKey } from './sessionEntryKey.ts';

/** `idle`: more pages may follow (a cursor, or the first page not yet fetched); `done`: cursor exhausted. */
export type ImportTargetStatus = 'done' | 'error' | 'idle' | 'loading';

export type ImportTargetState = {
  readonly cursor: string | undefined;
  readonly error: string | undefined;
  readonly pages: number;
  readonly seen: readonly string[];
  readonly status: ImportTargetStatus;
};

export type ImportState = {
  readonly cwd: string | undefined;
  /** Bumped by every open of Import, so a page answered for an earlier open is dropped. */
  readonly generation: number;
  readonly rows: readonly UnifiedHistoryEntry[];
  readonly targets: Readonly<Record<AgentLaunchTarget, ImportTargetState>>;
};

const idleTarget: ImportTargetState = { cursor: undefined, error: undefined, pages: 0, seen: [], status: 'idle' };

export const initialImportState = (cwd: string | undefined, generation: number): ImportState => ({
  cwd,
  generation,
  rows: [],
  targets: Object.fromEntries(
    MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => [launchTarget, idleTarget]),
  ) as ImportState['targets'],
});

const withTarget = (
  state: ImportState,
  launchTarget: AgentLaunchTarget,
  patch: Partial<ImportTargetState>,
): ImportState => ({
  ...state,
  targets: { ...state.targets, [launchTarget]: { ...state.targets[launchTarget], ...patch } },
});

/** The target starts fetching a page (an earlier error is cleared). */
export const beginImportPage = (state: ImportState, launchTarget: AgentLaunchTarget): ImportState =>
  withTarget(state, launchTarget, { error: undefined, status: 'loading' });

/** The target's page failed: only that target errors; the others keep paging. */
export const failImportPage = (state: ImportState, launchTarget: AgentLaunchTarget, error: string): ImportState =>
  withTarget(state, launchTarget, { error, status: 'error' });

/** Retry: the target pages again from where it stopped. */
export const resetImportTargetError = (state: ImportState, launchTarget: AgentLaunchTarget): ImportState =>
  withTarget(state, launchTarget, { error: undefined, status: 'idle' });

/**
 * Folds one `session/list` page of a target: rows merge into the list, the cursor advances. No `nextCursor` marks the
 * target done; a repeated cursor or the page cap marks only that target errored (the page's rows are kept).
 */
export const applyImportPage = (
  state: ImportState,
  launchTarget: AgentLaunchTarget,
  page: ListSessionsResponse,
): ImportState => {
  const byKey = new Map(state.rows.map(row => [sessionEntryKey(row), row]));
  for (const entry of normalizeSessionHistory(page)) {
    const row = { ...entry, launchTarget };
    byKey.set(sessionEntryKey(row), row);
  }
  const next = { ...state, rows: [...byKey.values()] };
  const target = state.targets[launchTarget];
  const pages = target.pages + 1;
  const nextCursor = page.nextCursor ?? undefined;
  if (nextCursor === undefined) {
    return withTarget(next, launchTarget, { cursor: undefined, pages, status: 'done' });
  }
  if (target.seen.includes(nextCursor)) {
    return withTarget(next, launchTarget, { error: 'The agent repeated a page cursor', pages, status: 'error' });
  }
  if (pages >= MAX_LIST_PAGES) {
    return withTarget(next, launchTarget, { error: 'The agent returned too many pages', pages, status: 'error' });
  }
  return withTarget(next, launchTarget, {
    cursor: nextCursor,
    pages,
    seen: [...target.seen, nextCursor],
    status: 'idle',
  });
};

/** Rows not yet tracked, newest Last prompt time first. `tracked` is the unified Session History (archived included). */
export const importableRows = (
  state: ImportState,
  tracked: readonly UnifiedHistoryEntry[],
): readonly UnifiedHistoryEntry[] => {
  const trackedKeys = new Set(tracked.map(sessionEntryKey));
  return state.rows
    .filter(row => !trackedKeys.has(sessionEntryKey(row)))
    .toSorted(compareHistoryEntriesByLastPromptDesc);
};

/** Launch targets that still have a page to fetch (idle, not loading, not done, not errored). */
export const targetsWithMorePages = (state: ImportState): readonly AgentLaunchTarget[] =>
  MOUNTED_AGENT_LAUNCH_TARGETS.filter(launchTarget => state.targets[launchTarget].status === 'idle');

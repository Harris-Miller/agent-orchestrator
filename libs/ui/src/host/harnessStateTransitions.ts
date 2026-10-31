/** Pure Harness state transitions over BackendHarnessSnapshot. */
import type {
  BackendHarnessSnapshot,
  HistoryEntry,
  NormalizedSessionInfo,
  PendingClientRequestKind,
  SessionSnapshot,
} from './acpSessionBootstrap.ts';
import { upsertHistoryEntry } from './acpSessionBootstrap.ts';
import { patchSession, upsertSession } from './sessionSnapshot.ts';
import type { SessionListScope } from './sessionListScope.ts';

export const markHistoryUnavailable = (history: readonly HistoryEntry[]): readonly HistoryEntry[] =>
  history.map(entry => ({ ...entry, unavailable: true }));

export const mergeListedHistory = (
  current: readonly HistoryEntry[],
  listed: readonly NormalizedSessionInfo[],
  scope: SessionListScope,
): readonly HistoryEntry[] => {
  if (scope._tag === 'Unscoped') return listed;
  if (scope._tag === 'Skip') return current;
  const ids = new Set(listed.map(entry => entry.sessionId));
  const kept = current.filter(entry => entry.cwd !== scope.cwd && !ids.has(entry.sessionId));
  const byId = new Map(kept.map(entry => [entry.sessionId, entry]));
  for (const entry of listed) byId.set(entry.sessionId, entry);
  return [...byId.values()];
};

/** Clear pending client request / elicitation / permission on the listed sessions. */
export const stripSessionPendings = (
  snapshot: BackendHarnessSnapshot,
  sessionIds: readonly string[],
): BackendHarnessSnapshot => {
  if (sessionIds.length === 0) {
    return snapshot;
  }
  const idSet = new Set(sessionIds);
  return {
    ...snapshot,
    sessions: Object.fromEntries(
      Object.entries(snapshot.sessions).map(([sessionId, session]) =>
        idSet.has(sessionId)
          ? [
              sessionId,
              {
                ...session,
                pendingClientRequest: undefined,
                pendingElicitation: undefined,
                pendingPermission: undefined,
              },
            ]
          : [sessionId, session],
      ),
    ),
  };
};

/**
 * Mark a session inactive and drop pendings (a cancelled prompt's response may never arrive after
 * `session/close`). Keeps `promptCancelRequested` so a late prompt error still resolves as cancelled.
 * Caller clears selection when selected === sessionId.
 */
export const markSessionInactive = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, session => ({
    ...session,
    pendingClientRequest: undefined,
    pendingElicitation: undefined,
    pendingPermission: undefined,
    status: 'inactive',
  })),
});

/** Remove session map entry and history row. Caller clears selection when selected === sessionId. */
export const dropSession = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot => {
  const { [sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
  return {
    ...snapshot,
    sessionHistory: snapshot.sessionHistory.filter(entry => entry.sessionId !== sessionId),
    sessions: remainingSessions,
  };
};

/** Replace the session history (refresh / Skip-empty). */
export const replaceSessionHistory = (
  snapshot: BackendHarnessSnapshot,
  history: readonly NormalizedSessionInfo[],
): BackendHarnessSnapshot => ({
  ...snapshot,
  sessionHistory: history,
});

/** At least one of session or historyEntry required. */
export type UpsertIntoSnapshotArgs =
  | { readonly historyEntry: NormalizedSessionInfo; readonly session?: undefined }
  | { readonly historyEntry?: NormalizedSessionInfo; readonly session: SessionSnapshot };

/** Upsert a session snapshot and/or history entry into the Backend harness snapshot (Bind or Materialize). */
export const upsertIntoSnapshot = (
  snapshot: BackendHarnessSnapshot,
  args: UpsertIntoSnapshotArgs,
): BackendHarnessSnapshot => {
  const { historyEntry, session } = args;
  return {
    ...snapshot,
    sessionHistory:
      historyEntry === undefined ? snapshot.sessionHistory : upsertHistoryEntry(snapshot.sessionHistory, historyEntry),
    sessions: session === undefined ? snapshot.sessions : upsertSession(snapshot.sessions, session),
  };
};

/**
 * Gate for outbound client→agent RPCs. Returns undefined when the session cannot accept the request;
 * otherwise the snapshot with pendingClientRequest set.
 */
export const beginClientRequest = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  kind: PendingClientRequestKind,
): BackendHarnessSnapshot | undefined => {
  if (!(sessionId in snapshot.sessions)) {
    return undefined;
  }
  const session = snapshot.sessions[sessionId];
  if (
    snapshot.phase !== 'ready' ||
    session.status !== 'active' ||
    session.pendingClientRequest !== undefined ||
    session.pendingElicitation !== undefined ||
    session.pendingPermission !== undefined
  ) {
    return undefined;
  }

  return {
    ...snapshot,
    sessions: patchSession(snapshot.sessions, sessionId, current => ({
      ...current,
      pendingClientRequest: kind,
    })),
  };
};

/** Clear pendingClientRequest and promptCancelRequested after a client request completes. */
export const endClientRequest = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, entry => ({
    ...entry,
    pendingClientRequest: undefined,
    promptCancelRequested: undefined,
  })),
});

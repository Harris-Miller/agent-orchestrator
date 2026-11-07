/** Pure Harness state transitions over BackendHarnessSnapshot. */
import type {
  BackendHarnessSnapshot,
  HistoryEntry,
  NormalizedSessionInfo,
  PendingClientRequestKind,
  SessionSnapshot,
} from './acpSessionBootstrap.ts';
import {
  initialBackendHarnessSnapshot,
  isUsablePhase,
  normalizeSessionHistory,
  upsertHistoryEntry,
} from './acpSessionBootstrap.ts';
import { patchSession, upsertSession } from './sessionSnapshot.ts';
import { resetSubagentLiveState } from './subagent.ts';
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

/** Publish-policy filter: drop Bound Virtual id from history until Materialize. */
export const excludeBoundVirtualFromHistory = (
  history: readonly NormalizedSessionInfo[],
  boundSessionId: string | undefined,
): readonly NormalizedSessionInfo[] =>
  boundSessionId === undefined ? history : history.filter(entry => entry.sessionId !== boundSessionId);

/** Next history after a successful `session/list`: normalize, hide Bound Virtual, merge by scope. */
export const historyAfterList = (
  current: readonly HistoryEntry[],
  listResult: unknown,
  scope: SessionListScope,
  boundSessionId: string | undefined,
): readonly HistoryEntry[] =>
  mergeListedHistory(
    current,
    excludeBoundVirtualFromHistory(normalizeSessionHistory(listResult), boundSessionId),
    scope,
  );

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

/** Drop one history row by id (e.g. a parallel startup list that landed before the Bound id existed). */
export const withoutHistoryEntry = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot => ({
  ...snapshot,
  sessionHistory: snapshot.sessionHistory.filter(entry => entry.sessionId !== sessionId),
});

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
    !isUsablePhase(snapshot.phase) ||
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

/**
 * Connection lost: local state once the provider's ACP Connection is gone. Every session inactive with pendings
 * cleared, history and transcripts preserved (history marked unavailable), connection-scoped state reset to a fresh
 * bootstrap (phase, failure, initialize result, Sign in URL). The RPC wire log is kept. Idempotent. Sessions are not
 * reopened; the caller cancels pending interactions and unbinds the Virtual session.
 */
export const reconcileConnectionLost = (snapshot: BackendHarnessSnapshot): BackendHarnessSnapshot => {
  const stripped = stripSessionPendings(snapshot, Object.keys(snapshot.sessions));
  return {
    ...initialBackendHarnessSnapshot(),
    rpcCalls: snapshot.rpcCalls,
    sessionHistory: markHistoryUnavailable(snapshot.sessionHistory),
    sessions: Object.fromEntries(
      Object.entries(stripped.sessions).map(([sessionId, session]) => [
        sessionId,
        { ...session, promptCancelRequested: undefined, status: 'inactive' as const },
      ]),
    ),
    // Keep child transcripts; drop state/capabilities/pendings until fresh post-response updates.
    subagents: Object.fromEntries(
      Object.entries(snapshot.subagents).map(([id, child]) => [id, resetSubagentLiveState(child)]),
    ),
  };
};

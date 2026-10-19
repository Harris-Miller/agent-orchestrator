/** Pure Harness state transitions over BackendHarnessSnapshot. */
import type {
  BackendHarnessSnapshot,
  NormalizedSessionInfo,
  PendingClientRequestKind,
  SessionSnapshot,
} from './acpSessionBootstrap.ts';
import { upsertRosterEntry } from './acpSessionBootstrap.ts';
import { patchSession, upsertSession } from './sessionSnapshot.ts';

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

/** Mark a session inactive. Caller clears selection when selected === sessionId. */
export const markSessionInactive = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, session => ({
    ...session,
    status: 'inactive',
  })),
});

/** Remove session map entry and roster row. Caller clears selection when selected === sessionId. */
export const dropSession = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot => {
  const { [sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
  return {
    ...snapshot,
    sessionRoster: snapshot.sessionRoster.filter(entry => entry.sessionId !== sessionId),
    sessions: remainingSessions,
  };
};

/** Replace the session roster (refresh / Skip-empty). */
export const replaceSessionRoster = (
  snapshot: BackendHarnessSnapshot,
  roster: readonly NormalizedSessionInfo[],
): BackendHarnessSnapshot => ({
  ...snapshot,
  sessionRoster: roster,
});

/** At least one of session or rosterEntry required. */
export type UpsertIntoSnapshotArgs =
  | { readonly rosterEntry: NormalizedSessionInfo; readonly session?: undefined }
  | { readonly rosterEntry?: NormalizedSessionInfo; readonly session: SessionSnapshot };

/** Upsert a session snapshot and/or roster entry into the Backend harness snapshot (Bind or Materialize). */
export const upsertIntoSnapshot = (
  snapshot: BackendHarnessSnapshot,
  args: UpsertIntoSnapshotArgs,
): BackendHarnessSnapshot => {
  const { rosterEntry, session } = args;
  return {
    ...snapshot,
    sessionRoster:
      rosterEntry === undefined ? snapshot.sessionRoster : upsertRosterEntry(snapshot.sessionRoster, rosterEntry),
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

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
import { turnAction } from './composerAction.ts';
import type { ComposerAction } from './composerAction.ts';
import { patchSession, upsertSession } from './sessionSnapshot.ts';
import { appendUserChatMessage, stampUserMessageTiming } from './sessionUpdateReducer.ts';
import type { UserMessageImageRef } from './sessionUpdateReducer.ts';
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
 * Whether `sessionId` can take a client request right now, as the Composer action rule ({@link turnAction}) decides it,
 * plus a usable Bootstrap phase. Consulted without Steering, so a prompt in flight is `CancelTurn`, never `Steer`.
 */
const clientRequestAction = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  hasContent: boolean,
): ComposerAction =>
  isUsablePhase(snapshot.phase)
    ? turnAction(sessionId in snapshot.sessions ? snapshot.sessions[sessionId] : undefined, {
        hasContent,
        steeringSupported: false,
      })
    : { _tag: 'Unavailable', reason: 'NotReady' };

/**
 * Gate for outbound client→agent RPCs (the Composer action rule). Returns undefined when the session cannot accept
 * the request; otherwise the snapshot with pendingClientRequest set.
 */
export const beginClientRequest = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  kind: PendingClientRequestKind,
): BackendHarnessSnapshot | undefined =>
  clientRequestAction(snapshot, sessionId, true)._tag === 'Send'
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, current => ({ ...current, pendingClientRequest: kind })),
      }
    : undefined;

/**
 * Clear pendingClientRequest and promptCancelRequested after a client request completes. A Session no longer in the
 * map stays dropped.
 */
export const endClientRequest = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, entry => ({
          ...entry,
          pendingClientRequest: undefined,
          promptCancelRequested: undefined,
        })),
      }
    : snapshot;

export type PromptTurnBegin =
  | { readonly _tag: 'Begun'; readonly snapshot: BackendHarnessSnapshot; readonly turnId: string }
  | { readonly _tag: 'Refused'; readonly action: ComposerAction };

/**
 * Prompt turn begin, in one step: the Composer action rule must decide Send; then the Pending client request is set
 * and the user message appended, stamped `startedAt`. `turnId` is that message's id. Refused leaves nothing changed.
 */
export const beginPromptTurn = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  turn: { readonly images?: readonly UserMessageImageRef[]; readonly startedAt: number; readonly text: string },
): PromptTurnBegin => {
  const images = turn.images !== undefined && turn.images.length > 0 ? turn.images : undefined;
  const action = clientRequestAction(snapshot, sessionId, turn.text.length > 0 || images !== undefined);
  if (action._tag !== 'Send') {
    return { _tag: 'Refused', action };
  }
  const session = snapshot.sessions[sessionId];
  const appended = appendUserChatMessage(session.transcript, turn.text, images);
  const turnId = appended.items.at(-1)?.id ?? '';
  return {
    _tag: 'Begun',
    snapshot: {
      ...snapshot,
      sessions: upsertSession(snapshot.sessions, {
        ...session,
        pendingClientRequest: 'prompt',
        transcript: stampUserMessageTiming(appended, turnId, { startedAt: turn.startedAt }),
      }),
    },
    turnId,
  };
};

/** Prompt turn end: {@link endClientRequest} and `endedAt` on the turn's user message. A dropped Session stays dropped. */
export const endPromptTurn = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  turnId: string,
  endedAt: number,
): BackendHarnessSnapshot => {
  const ended = endClientRequest(snapshot, sessionId);
  return ended === snapshot
    ? snapshot
    : {
        ...ended,
        sessions: patchSession(ended.sessions, sessionId, session => ({
          ...session,
          transcript: stampUserMessageTiming(session.transcript, turnId, { endedAt }),
        })),
      };
};

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

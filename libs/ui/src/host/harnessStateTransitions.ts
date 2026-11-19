/**
 * Pure Harness state transitions over BackendHarnessSnapshot: the only place the snapshot's next value is computed.
 * Atoms, the Harness event fold and host churn apply these to the latest snapshot and own no snapshot spreads.
 */
import type { AcpError, SessionFailure } from '@libs/effect-acp';

import type {
  AcpBootstrapPhase,
  BackendHarnessSnapshot,
  HistoryEntry,
  NormalizedSessionInfo,
  SessionConfiguration,
  SessionSnapshot,
} from './acpSessionBootstrap.ts';
import {
  initialBackendHarnessSnapshot,
  isUsablePhase,
  normalizeConfigOptions,
  normalizeSessionHistory,
  upsertHistoryEntry,
} from './acpSessionBootstrap.ts';
import { agentCapabilitiesFrom } from './agentCapabilities.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { withArchived } from './airMeta.ts';
import type { ApplySessionUpdateResult } from './applySessionUpdate.ts';
import { turnAction } from './composerAction.ts';
import type { ComposerAction, TurnActionInput } from './composerAction.ts';
import type { HarnessFailure } from './harnessFailure.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import { requestErrorDetails } from './requestError.ts';
import { configValue, foldConfigOptions, withConfigValue } from './sessionConfiguration.ts';
import type { ConfigValueDiff } from './sessionConfiguration.ts';
import { buildActivatedSession, historyEntryFromNew } from './sessionMaterialize.ts';
import { patchSession, upsertSession } from './sessionSnapshot.ts';
import {
  appendElicitationSummary,
  appendRequestErrorItem,
  appendUserChatMessage,
  emptySessionTranscript,
  markNonFinishedToolCallsCancelled,
  stampUserMessageTiming,
  upsertSessionFailure,
} from './sessionUpdateReducer.ts';
import type { ElicitationSummary, UserMessageImageRef } from './sessionUpdateReducer.ts';
import {
  getSubagent,
  initialSpawnedSubagentSnapshot,
  resetSubagentLiveState,
  withSubagentWorkState,
} from './subagent.ts';
import type { SubagentWorkState } from './subagent.ts';
import {
  patchSessionOrSubagent,
  resetSubagentsOfRoot,
  sessionOrSubagentOf,
  withParentChatItem,
} from './subagentRouting.ts';
import { withoutUndefined } from '../optionalFields.ts';
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

/** Set the History entry's archived mark. Archiving also drops the session snapshot; the row stays. */
export const setSessionArchived = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  archived: boolean,
): BackendHarnessSnapshot => {
  const sessionHistory = snapshot.sessionHistory.map(entry =>
    entry.sessionId === sessionId ? withArchived(entry, archived) : entry,
  );
  if (!archived) {
    return { ...snapshot, sessionHistory };
  }
  const { [sessionId]: _removed, ...sessions } = snapshot.sessions;
  return { ...snapshot, sessionHistory, sessions };
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
 * The Harness gate for `sessionId`: the Composer action rule ({@link turnAction}) plus a usable Bootstrap phase. Send,
 * Steering and every client-request begin consult it, so the Harness refuses whatever the Composer would not offer.
 */
export const sessionTurnAction = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  input: TurnActionInput,
): ComposerAction =>
  isUsablePhase(snapshot.phase)
    ? turnAction(sessionId in snapshot.sessions ? snapshot.sessions[sessionId] : undefined, input)
    : { _tag: 'Unavailable', reason: 'NotReady' };

/** A request that starts work (Send or Config change) never steers: a prompt in flight is `CancelTurn`. */
const startAction = (snapshot: BackendHarnessSnapshot, sessionId: string, hasContent: boolean): ComposerAction =>
  sessionTurnAction(snapshot, sessionId, { hasContent, steeringSupported: false });

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

export type ConfigChangeBegin =
  | {
      readonly _tag: 'Begun';
      readonly previous: boolean | string | undefined;
      readonly snapshot: BackendHarnessSnapshot;
    }
  | { readonly _tag: 'Refused'; readonly action: ComposerAction }
  | { readonly _tag: 'Unchanged' };

/**
 * Config change begin, in one step: `Unchanged` when the option already holds the value (never refused); `Refused`
 * unless the Composer action rule decides Send; otherwise the Pending client request `config` and the optimistic value
 * are set together, and `previous` is the option's value from the same read.
 */
export const beginConfigChange = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  change: ConfigValueDiff,
): ConfigChangeBegin => {
  const session = sessionId in snapshot.sessions ? snapshot.sessions[sessionId] : undefined;
  const previous = configValue(session?.configuration, change.configId);
  if (previous === change.value) {
    return { _tag: 'Unchanged' };
  }
  const action = startAction(snapshot, sessionId, true);
  if (action._tag !== 'Send' || session === undefined) {
    return { _tag: 'Refused', action };
  }
  return {
    _tag: 'Begun',
    previous,
    snapshot: {
      ...snapshot,
      sessions: upsertSession(snapshot.sessions, {
        ...session,
        configuration: withConfigValue(session.configuration ?? [], change.configId, change.value),
        pendingClientRequest: 'config',
      }),
    },
  };
};

/**
 * A `session/set_config_option` response: write the value that was set, then fold the response into the Session
 * configuration. A Session no longer in the map stays dropped.
 */
export const applyConfigResult = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  change: ConfigValueDiff,
  response: unknown,
): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, session => ({
          ...session,
          configuration: foldConfigOptions(
            withConfigValue(session.configuration ?? [], change.configId, change.value),
            response,
          ),
        })),
      }
    : snapshot;

/**
 * Config change end: {@link endClientRequest}; with `revert`, also set the option back to `previous`, but only while it
 * still holds the value the change wrote. A Session no longer in the map stays dropped.
 */
export const endConfigChange = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  revert?: { readonly change: ConfigValueDiff; readonly previous: boolean | string | undefined },
): BackendHarnessSnapshot => {
  const ended = endClientRequest(snapshot, sessionId);
  if (ended === snapshot || revert === undefined) {
    return ended;
  }
  const { change, previous } = revert;
  return {
    ...ended,
    sessions: patchSession(ended.sessions, sessionId, session =>
      configValue(session.configuration, change.configId) === change.value
        ? { ...session, configuration: withConfigValue(session.configuration ?? [], change.configId, previous) }
        : session,
    ),
  };
};

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
  const action = startAction(snapshot, sessionId, turn.text.length > 0 || images !== undefined);
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

/** Add or revise the Session failure row in `sessionId`'s chat (see `upsertSessionFailure`); unknown session: unchanged. */
export const applySessionFailure = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  failure: SessionFailure,
): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, session => ({
          ...session,
          transcript: upsertSessionFailure(session.transcript, failure),
        })),
      }
    : snapshot;

/** The Agent answered a Client→Agent request for `sessionId` with an error: it joins that Session's transcript. A dropped Session stays dropped. */
export const appendRequestError = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  { error, method }: { readonly error: AcpError; readonly method: string },
): BackendHarnessSnapshot => {
  if (!(sessionId in snapshot.sessions)) {
    return snapshot;
  }
  const details = requestErrorDetails(error);
  return {
    ...snapshot,
    sessions: patchSession(snapshot.sessions, sessionId, session => ({
      ...session,
      transcript: appendRequestErrorItem(session.transcript, {
        code: error.code,
        ...(details === undefined ? {} : { details }),
        message: error.message,
        method,
      }),
    })),
  };
};

/** Initialize answered: store the raw result (Developer panel) and the Agent capabilities read from it, once. */
export const applyInitializeResult = (
  snapshot: BackendHarnessSnapshot,
  launchTarget: AgentLaunchTarget,
  initializeResult: unknown,
): BackendHarnessSnapshot => ({
  ...snapshot,
  agentCapabilities: agentCapabilitiesFrom(launchTarget, initializeResult),
  initializeResult,
  phase: 'initialized',
});

/**
 * Connection lost: local state once the provider's ACP Connection is gone. Every session inactive with pendings
 * cleared, history and transcripts preserved (history marked unavailable), connection-scoped state reset to a fresh
 * bootstrap (phase, failure, initialize result and Agent capabilities, Sign in URL). Idempotent. Sessions are not
 * reopened; the caller cancels pending interactions and unbinds the Virtual session.
 */
export const reconcileConnectionLost = (snapshot: BackendHarnessSnapshot): BackendHarnessSnapshot => {
  const stripped = stripSessionPendings(snapshot, Object.keys(snapshot.sessions));
  return {
    ...initialBackendHarnessSnapshot(),
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

/** Bootstrap phase reported with its failure; the Sign in URL is dropped once the attempt is past signing in. */
export const applyBootstrapPhase = (
  snapshot: BackendHarnessSnapshot,
  phase: AcpBootstrapPhase,
  failure: HarnessFailure | undefined,
): BackendHarnessSnapshot => ({
  ...snapshot,
  ...(isUsablePhase(phase) || phase === 'error' || phase === 'connecting' ? { antigravityAuthUrl: undefined } : {}),
  failure,
  phase,
});

/** Antigravity Sign in URL captured from the BROWSER helper. */
export const setAntigravityAuthUrl = (snapshot: BackendHarnessSnapshot, url: string): BackendHarnessSnapshot => ({
  ...snapshot,
  antigravityAuthUrl: url,
});

/** Next Session History after a successful `session/list` (see {@link historyAfterList}). */
export const applySessionList = (
  snapshot: BackendHarnessSnapshot,
  listResult: unknown,
  scope: SessionListScope,
  boundSessionId: string | undefined,
): BackendHarnessSnapshot =>
  replaceSessionHistory(snapshot, historyAfterList(snapshot.sessionHistory, listResult, scope, boundSessionId));

/**
 * Activation begins: cwd stamped, defects, usage and `replayComplete` cleared, status `activating`, descendant Subagents reset. A `load`
 * replays the whole history, so it starts from an empty transcript; a `resume` keeps the local one.
 */
export const beginActivation = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  cwd: string,
  mode: 'load' | 'resume',
): BackendHarnessSnapshot =>
  resetSubagentsOfRoot(
    {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, session => ({
        ...session,
        cwd,
        defects: undefined,
        status: 'activating',
        replayComplete: undefined,
        ...(mode === 'load' ? { transcript: emptySessionTranscript() } : {}),
        usage: undefined,
      })),
    },
    sessionId,
  );

/**
 * `session/load` or `session/resume` failed: the failure's defects recorded, the Session `inactive`, and the
 * transcript it had before activation began restored (a failed load must not lose the prior view), unless the replay
 * already completed (AIR `loadReplayEnd`): then the fully replayed transcript is kept.
 */
export const failActivation = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  defects: readonly unknown[],
  previousTranscript: SessionSnapshot['transcript'] | undefined,
): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, session => ({
    ...session,
    defects,
    status: 'inactive',
    ...(previousTranscript === undefined || session.replayComplete === true ? {} : { transcript: previousTranscript }),
  })),
});

/** `session/unarchive` failed before activation: the failure's defects recorded, status untouched. */
export const failUnarchive = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  defects: readonly unknown[],
): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, session => ({ ...session, defects })),
});

/** Activation cannot start: no cwd on the snapshot or History entry. The Session stays `inactive`. */
export const markActivationCwdMissing = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, session => ({
    ...session,
    defects: [{ message: 'Session cwd missing from snapshot and history' }],
    status: 'inactive',
  })),
});

/** The loaded or resumed Session configuration, while the Session is still `activating`. */
export const applyLoadedConfiguration = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  configuration: SessionConfiguration,
): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, session => ({ ...session, configuration })),
});

/** Activation done: the Session becomes `active`, keeping the latest Session configuration and carried fields. */
export const finishActivation = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot => ({
  ...snapshot,
  sessions: patchSession(snapshot.sessions, sessionId, session =>
    buildActivatedSession(sessionId, session.configuration ?? [], session),
  ),
});

/** A `session/new` answer: its id and the cwd it was created for. */
export type CreatedSession = {
  readonly cwd: string;
  readonly result: { readonly sessionId: string };
};

const activatedFromNew = ({ cwd, result }: CreatedSession): SessionSnapshot =>
  buildActivatedSession(result.sessionId, normalizeConfigOptions(result), { cwd });

/** `session/new` answered outside Bind (handoff target): its active Session and its Session History row join together. */
export const addCreatedSession = (snapshot: BackendHarnessSnapshot, created: CreatedSession): BackendHarnessSnapshot =>
  upsertIntoSnapshot(snapshot, {
    historyEntry: historyEntryFromNew(created.result, created.cwd),
    session: activatedFromNew(created),
  });

/**
 * Bind created a session: it joins the sessions map only — not a History entry, not Materialize — and drops a row a
 * parallel startup `session/list` added before the id existed.
 */
export const bindSession = (snapshot: BackendHarnessSnapshot, created: CreatedSession): BackendHarnessSnapshot =>
  withoutHistoryEntry(upsertIntoSnapshot(snapshot, { session: activatedFromNew(created) }), created.result.sessionId);

/** {@link dropSession} only while the Session or its History row is still there (a no-op returns `snapshot`). */
export const dropSessionIfPresent = (snapshot: BackendHarnessSnapshot, sessionId: string): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions || snapshot.sessionHistory.some(entry => entry.sessionId === sessionId)
    ? dropSession(snapshot, sessionId)
    : snapshot;

/**
 * Steering was injected into the in-flight turn: the message joins the transcript with no turn timing and the Pending
 * client request is untouched (ADR-0018). A Session no longer in the map stays dropped.
 */
export const appendSteeredMessage = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  text: string,
  images: readonly UserMessageImageRef[],
): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, session => ({
          ...session,
          transcript: appendUserChatMessage(session.transcript, text, images.length > 0 ? images : undefined, {
            steering: true,
          }),
        })),
      }
    : snapshot;

/**
 * Prompt turn cancel requested: only the interactions just cancelled are cleared (one the agent raised meanwhile stays
 * answerable), unfinished tool calls are marked cancelled and `promptCancelRequested` is set. A dropped Session stays
 * dropped.
 */
export const requestPromptCancel = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  cancelled: { readonly elicitation?: PendingElicitation; readonly permission?: PendingPermission },
): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, session => ({
          ...session,
          pendingElicitation:
            session.pendingElicitation === cancelled.elicitation ? undefined : session.pendingElicitation,
          pendingPermission: session.pendingPermission === cancelled.permission ? undefined : session.pendingPermission,
          promptCancelRequested: true,
          transcript: markNonFinishedToolCallsCancelled(session.transcript),
        })),
      }
    : snapshot;

/** An elicitation request raised on its Session or Subagent session (a newer one replaces it). */
export const raiseElicitation = (
  snapshot: BackendHarnessSnapshot,
  pending: PendingElicitation,
): BackendHarnessSnapshot =>
  patchSessionOrSubagent(snapshot, pending.sessionId, holder => ({ ...holder, pendingElicitation: pending }));

/** A permission request raised on its Session or Subagent session (a newer one replaces it). */
export const raisePermission = (snapshot: BackendHarnessSnapshot, pending: PendingPermission): BackendHarnessSnapshot =>
  patchSessionOrSubagent(snapshot, pending.sessionId, holder => ({ ...holder, pendingPermission: pending }));

/**
 * An elicitation was answered: clear only that one (a newer one stays answerable) and append the accepted-form summary
 * when there is one. A holder no longer in the snapshot is left alone.
 */
export const answerElicitation = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  answered: PendingElicitation,
  summary: ElicitationSummary | undefined,
): BackendHarnessSnapshot =>
  sessionOrSubagentOf(snapshot, sessionId) === undefined
    ? snapshot
    : patchSessionOrSubagent(snapshot, sessionId, holder => ({
        ...holder,
        pendingElicitation: holder.pendingElicitation === answered ? undefined : holder.pendingElicitation,
        transcript: summary === undefined ? holder.transcript : appendElicitationSummary(holder.transcript, summary),
      }));

/** A permission request was answered: cleared only while it is still the pending one. */
export const answerPermission = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  answered: PendingPermission,
): BackendHarnessSnapshot =>
  sessionOrSubagentOf(snapshot, sessionId)?.pendingPermission === answered
    ? patchSessionOrSubagent(snapshot, sessionId, holder => ({ ...holder, pendingPermission: undefined }))
    : snapshot;

/** A live `session/update` applied to its Session: the patched Session upserted, and the History row retitled when the update carried one. */
export const applySessionUpdatePatch = (
  snapshot: BackendHarnessSnapshot,
  patch: Extract<ApplySessionUpdateResult, { readonly kind: 'patch' }>,
): BackendHarnessSnapshot => ({
  ...snapshot,
  sessionHistory: patch.sessionHistory ?? snapshot.sessionHistory,
  sessions: upsertSession(snapshot.sessions, patch.session),
});

// ---------------------------------------------------------------------------------------------------------------------
// Spawned subagent session mirror (libs/ui ADR 0011): the child is a root Session on its own launch target; its parent's
// launch target holds a Subagent session that projects it, so the Subagent view, Work state and Attention read it
// like a native child. Mirror and root always live in different snapshots.
// ---------------------------------------------------------------------------------------------------------------------

/** The mirror in the parent's snapshot, running, with its row in the parent's transcript; before the child's first prompt. */
export const mirrorChildIntoParent = (
  snapshot: BackendHarnessSnapshot,
  mirror: {
    readonly childId: string;
    readonly launchTarget: AgentLaunchTarget;
    readonly name: string;
    readonly parentId: string;
    /** Exactly the text `beginPromptTurn` appends, so the Subagent view strips it from the transcript. */
    readonly task: string;
  },
): BackendHarnessSnapshot =>
  withParentChatItem(
    {
      ...snapshot,
      subagents: {
        ...snapshot.subagents,
        [mirror.childId]: withSubagentWorkState(
          {
            ...initialSpawnedSubagentSnapshot(mirror.childId, mirror.parentId, mirror.launchTarget),
            capabilities: { cancel: {} },
            name: mirror.name,
            task: mirror.task,
          },
          { state: 'running' },
        ),
      },
    },
    mirror.parentId,
    mirror.childId,
  );

/**
 * Project the child's root entry onto its mirror: transcript and Pending interactions (the same objects, so answering on
 * the root entry is answering the mirror's). A mirror that is gone, or already equal, is left alone.
 */
export const projectChildOnto = (
  snapshot: BackendHarnessSnapshot,
  childId: string,
  root: Pick<SessionSnapshot, 'pendingElicitation' | 'pendingPermission' | 'transcript'>,
): BackendHarnessSnapshot => {
  const mirror = getSubagent(snapshot.subagents, childId);
  if (
    mirror === undefined ||
    (mirror.transcript === root.transcript &&
      mirror.pendingPermission === root.pendingPermission &&
      mirror.pendingElicitation === root.pendingElicitation)
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    subagents: {
      ...snapshot.subagents,
      [childId]: withoutUndefined({
        ...mirror,
        pendingElicitation: root.pendingElicitation,
        pendingPermission: root.pendingPermission,
        transcript: root.transcript,
      }),
    },
  };
};

/** Set a Spawned subagent session's Work state on its mirror (a mirror that is gone stays gone). */
export const setMirrorWorkState = (
  snapshot: BackendHarnessSnapshot,
  childId: string,
  state: SubagentWorkState,
): BackendHarnessSnapshot => {
  const mirror = getSubagent(snapshot.subagents, childId);
  return mirror === undefined
    ? snapshot
    : { ...snapshot, subagents: { ...snapshot.subagents, [childId]: withSubagentWorkState(mirror, state) } };
};

/** A Session History row for a Session that has none (a row already there, from a list refresh, is kept). */
export const withHistoryEntryIfAbsent = (
  snapshot: BackendHarnessSnapshot,
  entry: NormalizedSessionInfo,
): BackendHarnessSnapshot =>
  snapshot.sessionHistory.some(row => row.sessionId === entry.sessionId)
    ? snapshot
    : upsertIntoSnapshot(snapshot, { historyEntry: entry });

/** Remove a mirror (a child that never ran). */
export const dropMirror = (snapshot: BackendHarnessSnapshot, childId: string): BackendHarnessSnapshot => {
  const { [childId]: _removed, ...subagents } = snapshot.subagents;
  return getSubagent(snapshot.subagents, childId) === undefined ? snapshot : { ...snapshot, subagents };
};

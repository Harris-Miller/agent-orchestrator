/**
 * Pure Harness state transitions over BackendHarnessSnapshot: the only place the snapshot's next value is computed.
 * Atoms, the Harness event fold and host churn apply these to the latest snapshot and own no snapshot spreads.
 */
import { acpErrorMessage } from '@libs/effect-acp';
import type { AcpError, SessionFailure } from '@libs/effect-acp';
import { Option, Predicate } from 'effect';

import type {
  AcpBootstrapPhase,
  BackendHarnessSnapshot,
  HistoryEntry,
  NormalizedSessionInfo,
  SessionConfiguration,
  SessionSnapshot,
} from './acpSessionBootstrap.ts';
import {
  applySessionInfoTitle,
  clearHistoryActivityState,
  initialBackendHarnessSnapshot,
  initialSessionSnapshot,
  isUsablePhase,
  normalizeConfigOptions,
  touchHistoryLastPromptTime,
  touchHistoryUpdatedAt,
  upsertHistoryEntry,
} from './acpSessionBootstrap.ts';
import { agentCapabilitiesFrom } from './agentCapabilities.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { isLoadReplayEnd } from './airMeta.ts';
import { withArchived } from './historyEntry.ts';
import { turnAction } from './composerAction.ts';
import type { ComposerAction, TurnActionInput } from './composerAction.ts';
import type { HarnessFailure } from './harnessFailure.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import {
  permissionsOf,
  queueElicitation,
  queuePermission,
  withoutAllPendingInteractions,
  withoutPendingInteractions,
} from './pendingInteractions.ts';
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
  parseAvailableCommands,
  parseUsageUpdate,
  reduceSessionUpdate,
  stampUserMessageTiming,
  upsertSessionFailure,
} from './sessionUpdateReducer.ts';
import type { ElicitationSummary, UserMessageImageRef } from './sessionUpdateReducer.ts';
import {
  applySubagentPatch,
  decodeSubagentUpdate,
  getSubagent,
  hasBackgroundActivity,
  initialSpawnedSubagentSnapshot,
  initialSubagentSnapshot,
  isSubagentTerminal,
  reduceSubagentTranscriptUpdate,
  resetSubagentLiveState,
  rootAncestorId,
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
import type { KnownSubagentResult } from './subagentResult.ts';

export const markHistoryUnavailable = (history: readonly HistoryEntry[]): readonly HistoryEntry[] =>
  history.map(entry => ({ ...entry, unavailable: true }));

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
          ? [sessionId, { ...withoutAllPendingInteractions(session), pendingClientRequest: undefined }]
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
    ...withoutAllPendingInteractions(session),
    pendingClientRequest: undefined,
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
  input: Omit<TurnActionInput, 'backgroundActive'>,
): ComposerAction =>
  isUsablePhase(snapshot.phase)
    ? turnAction(sessionId in snapshot.sessions ? snapshot.sessions[sessionId] : undefined, {
        ...input,
        backgroundActive: hasBackgroundActivity(snapshot, sessionId),
      })
    : { _tag: 'Unavailable', reason: 'NotReady' };

/** A request that starts work (Send or Config change) never steers: a prompt in flight is `CancelTurn`. */
const startAction = (snapshot: BackendHarnessSnapshot, sessionId: string, hasContent: boolean): ComposerAction =>
  sessionTurnAction(snapshot, sessionId, {
    hasContent,
    steeringSupported: false,
  });

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
  if (ended === snapshot) {
    return snapshot;
  }
  const endedIso = new Date(endedAt).toISOString();
  return {
    ...ended,
    // Idle age for the Idle session sweep: the turn end is the Session's last activity.
    // A prompt turn is a user prompt: it also advances a row's Last prompt time (which orders the History).
    // The turn has ended, so a listed running / requires-action badge would be stale.
    sessionHistory: clearHistoryActivityState(
      touchHistoryLastPromptTime(touchHistoryUpdatedAt(ended.sessionHistory, sessionId, endedIso), sessionId, endedIso),
      sessionId,
    ),
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
        message: acpErrorMessage(error),
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

/** Bind created a session: it joins the sessions map only — not a History entry, not Materialize. */
export const bindSession = (snapshot: BackendHarnessSnapshot, created: CreatedSession): BackendHarnessSnapshot =>
  upsertIntoSnapshot(snapshot, { session: activatedFromNew(created) });

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

/** The Pending interactions a Prompt turn cancel answers: every one the Session held when the cancel started. */
export type CancelledInteractions = {
  readonly elicitations: readonly PendingElicitation[];
  readonly permissions: readonly PendingPermission[];
};

/**
 * Prompt turn cancel requested: only the interactions just cancelled are cleared (one the agent raised meanwhile stays
 * answerable), unfinished tool calls are marked cancelled and `promptCancelRequested` is set. A dropped Session stays
 * dropped.
 */
export const requestPromptCancel = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  cancelled: CancelledInteractions,
): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, session => ({
          ...withoutPendingInteractions(session, cancelled),
          promptCancelRequested: true,
          transcript: markNonFinishedToolCallsCancelled(session.transcript),
        })),
      }
    : snapshot;

/**
 * Cancel with no Prompt turn (Background follow-up): like {@link requestPromptCancel} but no `promptCancelRequested`
 * (there is no turn to soft-cancel) and the transcript is untouched.
 */
export const clearCancelledInteractions = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  cancelled: CancelledInteractions,
): BackendHarnessSnapshot =>
  sessionId in snapshot.sessions
    ? {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, sessionId, session => withoutPendingInteractions(session, cancelled)),
      }
    : snapshot;

/** An elicitation request raised on its Session or Subagent session: shown, or waiting behind the ones raised before it. */
export const raiseElicitation = (
  snapshot: BackendHarnessSnapshot,
  pending: PendingElicitation,
): BackendHarnessSnapshot =>
  patchSessionOrSubagent(snapshot, pending.sessionId, holder => queueElicitation(holder, pending));

/** A permission request raised on its Session or Subagent session: shown, or waiting behind the ones raised before it. */
export const raisePermission = (snapshot: BackendHarnessSnapshot, pending: PendingPermission): BackendHarnessSnapshot =>
  patchSessionOrSubagent(snapshot, pending.sessionId, holder => queuePermission(holder, pending));

/**
 * An elicitation was answered: clear only that one (the next waiting one is shown) and append the accepted-form summary
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
        ...withoutPendingInteractions(holder, { elicitations: [answered] }),
        transcript: summary === undefined ? holder.transcript : appendElicitationSummary(holder.transcript, summary),
      }));

/** A permission request was answered: cleared while the holder still has it (the next waiting one is shown). */
export const answerPermission = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  answered: PendingPermission,
): BackendHarnessSnapshot => {
  const holder = sessionOrSubagentOf(snapshot, sessionId);
  return holder !== undefined && permissionsOf(holder).includes(answered)
    ? patchSessionOrSubagent(snapshot, sessionId, current =>
        withoutPendingInteractions(current, { permissions: [answered] }),
      )
    : snapshot;
};

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

const isFinishedResult = (status: KnownSubagentResult['status']): status is 'cancelled' | 'completed' | 'failed' =>
  status !== 'running';

/**
 * Fold a Subagent result found in the parent's transcript (live or replayed) into a Restored subagent: read-only, with
 * its row in the parent's transcript (ensured on every fold, once per child), holding only what the result recorded (glossary). A live mirror
 * is never touched; a restored one only moves from unknown to a finished state, never back.
 */
export const restoreSubagentFromResult = (
  snapshot: BackendHarnessSnapshot,
  parentId: string,
  result: KnownSubagentResult,
): BackendHarnessSnapshot => {
  const { launchTarget } = result;
  const existing = getSubagent(snapshot.subagents, result.id);
  if (existing !== undefined) {
    const upgradable =
      existing.kind === 'spawned' &&
      existing.restored !== undefined &&
      isFinishedResult(result.status) &&
      !isSubagentTerminal(existing.state);
    if (!upgradable) {
      // Still ensure the row: a re-load empties the parent's transcript but keeps the child.
      return withParentChatItem(snapshot, parentId, result.id);
    }
  }
  const base = existing ?? {
    ...initialSpawnedSubagentSnapshot(result.id, parentId, launchTarget),
    name: result.description,
    restored: { config: result.config },
    task: result.task,
  };
  const restored = isFinishedResult(result.status)
    ? withSubagentWorkState(
        {
          ...base,
          transcript: reduceSessionUpdate(emptySessionTranscript(), {
            content: { text: result.body, type: 'text' },
            sessionUpdate: 'agent_message_chunk',
          }),
        },
        result.status === 'failed' ? { error: result.body, state: 'failed' } : { state: result.status },
      )
    : withSubagentWorkState(base, { state: 'unknown' });
  return withParentChatItem(
    { ...snapshot, subagents: { ...snapshot.subagents, [result.id]: restored } },
    parentId,
    result.id,
  );
};

/**
 * Project the child's root entry onto its mirror: transcript and Pending interactions (the same objects, so answering on
 * the root entry is answering the mirror's). A mirror that is gone, or already equal, is left alone.
 */
export const projectChildOnto = (
  snapshot: BackendHarnessSnapshot,
  childId: string,
  root: Pick<
    SessionSnapshot,
    'pendingElicitation' | 'pendingPermission' | 'transcript' | 'waitingElicitations' | 'waitingPermissions'
  >,
): BackendHarnessSnapshot => {
  const mirror = getSubagent(snapshot.subagents, childId);
  if (
    mirror === undefined ||
    (mirror.transcript === root.transcript &&
      mirror.pendingPermission === root.pendingPermission &&
      mirror.pendingElicitation === root.pendingElicitation &&
      mirror.waitingPermissions === root.waitingPermissions &&
      mirror.waitingElicitations === root.waitingElicitations)
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    subagents: {
      ...snapshot.subagents,
      // The root entry's own arrays, so an unchanged root compares equal next time.
      [childId]: withoutUndefined({
        ...mirror,
        pendingElicitation: root.pendingElicitation,
        pendingPermission: root.pendingPermission,
        transcript: root.transcript,
        waitingElicitations: root.waitingElicitations,
        waitingPermissions: root.waitingPermissions,
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

// ---------------------------------------------------------------------------------------------------------------------
// Live session/update: one inbound `session/update` folded into the snapshot, routed to its Subagent session or its
// root Session.
// ---------------------------------------------------------------------------------------------------------------------

const SUBAGENT_KINDS = new Set(['subagent_spawned', 'subagent_state_update', 'subagent_update']);

/** A child newly linked to its parent by an update (for turn-correlated tracing). */
export type SubagentLinked = { readonly childId: string; readonly parentId: string };

type LiveUpdateResult = { readonly linked?: SubagentLinked; readonly snapshot: BackendHarnessSnapshot };

/**
 * An update that belongs to the Subagent tree, or `undefined` for a plain root-session update (unseen ids fall
 * through: a root's first updates can precede its `session/new` response).
 */
const routeSubagentUpdate = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  update: unknown,
): LiveUpdateResult | undefined => {
  if (
    Predicate.isObject(update) &&
    typeof update.sessionUpdate === 'string' &&
    SUBAGENT_KINDS.has(update.sessionUpdate)
  ) {
    const decoded = decodeSubagentUpdate(update);
    if (Option.isNone(decoded)) return { snapshot };
    const patch = decoded.value;
    const childId = patch.subagentSessionId;
    const existing = getSubagent(snapshot.subagents, childId);
    // Never self-reference, cycle, or reparent.
    if (
      childId === sessionId ||
      (existing === undefined && rootAncestorId(snapshot.subagents, sessionId) === childId)
    ) {
      return { snapshot };
    }
    const parentId = existing?.parentSessionId ?? sessionId;
    const migratedRoot = existing === undefined && childId in snapshot.sessions;
    const { [childId]: stray, ...sessions } = snapshot.sessions;
    // Updates and requests that raced ahead of the spawn landed on a stray root entry; keep them on the child.
    const seed = existing ?? initialSubagentSnapshot(childId, parentId, migratedRoot ? stray : undefined);
    const child = applySubagentPatch(seed, patch);
    const withChild: BackendHarnessSnapshot = {
      ...snapshot,
      sessions: migratedRoot ? sessions : snapshot.sessions,
      subagents: { ...snapshot.subagents, [childId]: child },
    };
    return {
      linked: { childId, parentId },
      snapshot: withParentChatItem(withChild, parentId, childId),
    };
  }

  const child = getSubagent(snapshot.subagents, sessionId);
  // A Spawned subagent's mirror is projected from its root entry (ADR 0011): its updates are root updates, even when
  // the child shares the parent's launch target and so this snapshot.
  if (child === undefined || child.kind === 'spawned') return undefined;
  const next = reduceSubagentTranscriptUpdate(child, update);
  return {
    snapshot: next === child ? snapshot : { ...snapshot, subagents: { ...snapshot.subagents, [sessionId]: next } },
  };
};

/** One root-session update: the transcript, the non-transcript kinds, and the History row's title / updated time. */
const applyRootSessionUpdate = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  update: unknown,
): BackendHarnessSnapshot => {
  const history = snapshot.sessionHistory;
  const base = snapshot.sessions[sessionId] ?? initialSessionSnapshot(sessionId);
  const nextTranscript = reduceSessionUpdate(base.transcript, update);
  let next: SessionSnapshot = nextTranscript === base.transcript ? base : { ...base, transcript: nextTranscript };
  let sessionChanged = next !== base;
  let sessionHistory: readonly NormalizedSessionInfo[] | undefined;

  if (Predicate.isObject(update) && typeof update.sessionUpdate === 'string') {
    switch (update.sessionUpdate) {
      case 'available_commands_update': {
        next = { ...next, availableCommands: parseAvailableCommands(update.availableCommands) };
        sessionChanged = true;
        break;
      }
      case 'config_option_update': {
        if (Array.isArray(update.configOptions)) {
          next = { ...next, configuration: foldConfigOptions(next.configuration, update) };
          sessionChanged = true;
        }
        break;
      }
      case 'session_info_update': {
        if (isLoadReplayEnd(update)) {
          if (base.status === 'activating') {
            next = { ...next, replayComplete: true };
            sessionChanged = true;
          }
        } else {
          if (typeof update.title === 'string') {
            sessionHistory = applySessionInfoTitle(history, sessionId, update.title);
          }
          if (typeof update.updatedAt === 'string') {
            sessionHistory = touchHistoryUpdatedAt(sessionHistory ?? history, sessionId, update.updatedAt);
          }
        }
        break;
      }
      case 'usage_update': {
        const usage = parseUsageUpdate(update);
        if (usage !== undefined) {
          next = { ...next, usage };
          sessionChanged = true;
        }
        break;
      }
      default:
        break;
    }
  }

  if (!sessionChanged && sessionHistory === undefined) {
    return snapshot;
  }
  return {
    ...snapshot,
    sessionHistory: sessionHistory ?? snapshot.sessionHistory,
    sessions: upsertSession(snapshot.sessions, next),
  };
};

/** A Hub subagent tool call that now carries Subagent results restores each child they name (ADR 0013). */
const restoreSubagentsOfToolCall = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  update: unknown,
): BackendHarnessSnapshot => {
  if (!Predicate.isObject(update) || typeof update.toolCallId !== 'string') {
    return snapshot;
  }
  const transcript = sessionOrSubagentOf(snapshot, sessionId)?.transcript;
  const index = transcript?.toolCallIndices.get(update.toolCallId);
  const item = index === undefined ? undefined : transcript?.items[index];
  return item?.kind !== 'tool_call' || item.subagentResults === undefined
    ? snapshot
    : item.subagentResults.reduce((next, result) => restoreSubagentFromResult(next, sessionId, result), snapshot);
};

/**
 * A live `session/update` from the agent: routed to its Subagent session (spawn, state, transcript) or folded into its
 * root Session (seeding one not seen yet), retitling the History row, and restoring the Subagents a Hub subagent tool
 * call's results name. The same snapshot when nothing changed. `linked` names a child the update linked to its parent.
 */
export const applyLiveSessionUpdate = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  update: unknown,
): LiveUpdateResult => {
  const routed = routeSubagentUpdate(snapshot, sessionId, update);
  if (routed !== undefined) {
    return routed;
  }
  const next = applyRootSessionUpdate(snapshot, sessionId, update);
  return { snapshot: next === snapshot ? snapshot : restoreSubagentsOfToolCall(next, sessionId, update) };
};

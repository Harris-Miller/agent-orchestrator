/** Pure subagent-session model: wire decode, child snapshot, and nullable-patch reducer. */
import { SubagentUpdate } from '@libs/effect-acp';
import type { Option } from 'effect';
import { Schema } from 'effect';

import { isRecord } from '../isRecord.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { withoutUndefined } from '../optionalFields.ts';

import { rootAncestor } from './ancestry.ts';
import type { SessionSnapshot } from './acpSessionBootstrap.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import { emptySessionTranscript, latestTranscriptActivity, reduceSessionUpdate } from './sessionUpdateReducer.ts';
import type { SessionTranscript } from './sessionUpdateReducer.ts';

/** Open union: `completed`/`idle` finished, `running`/`requires_action` live, anything else renders neutral. */
export type SubagentWorkState = {
  readonly error?: unknown;
  readonly state: string;
  readonly stopReason?: string;
};

type SubagentSnapshotBase = {
  /** Replaced whole by each patch; undefined = none/unconfirmed. */
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly name?: string;
  readonly parentSessionId: string;
  readonly pendingElicitation?: PendingElicitation;
  readonly pendingPermission?: PendingPermission;
  readonly sessionId: string;
  /** Undefined until a state update arrives (and again after load/resume/connection loss). */
  readonly state?: SubagentWorkState;
  /** Set by a reset (load/resume/connection loss) while `state` is missing; cleared by the next state update. */
  readonly stateUnconfirmed?: true;
  readonly task?: string;
  readonly transcript: SessionTranscript;
};

/**
 * `native`: the agent announced it; always on the parent's launch target. `spawned`: the Harness started it on another
 * launch target, whose connection it lives on.
 */
export type NativeSubagentSnapshot = SubagentSnapshotBase & { readonly kind: 'native' };

export type SubagentSnapshot =
  | NativeSubagentSnapshot
  | (SubagentSnapshotBase & { readonly kind: 'spawned'; readonly launchTarget: AgentLaunchTarget });

export type SubagentRecord = Readonly<Record<string, SubagentSnapshot>>;

const getSession = (sessions: Readonly<Record<string, SessionSnapshot>>, sessionId: string) =>
  sessionId in sessions ? sessions[sessionId] : undefined;

/** Typed lookup (Record indexing is not `| undefined`). */
export const getSubagent = (subagents: SubagentRecord, sessionId: string): SubagentSnapshot | undefined =>
  sessionId in subagents ? subagents[sessionId] : undefined;

/** Known work-state wire strings; the wire type stays an open string. */
export const WORK_STATE = {
  cancelled: 'cancelled',
  completed: 'completed',
  failed: 'failed',
  idle: 'idle',
  requiresAction: 'requires_action',
  running: 'running',
} as const;

const FINISHED_STATES = new Set<string>([WORK_STATE.completed, WORK_STATE.idle]);

/** Final states: safe to keep across load/resume/connection loss. */
const TERMINAL_STATES = new Set<string>([WORK_STATE.cancelled, WORK_STATE.completed, WORK_STATE.failed]);

export const isSubagentTerminal = (state: SubagentWorkState | undefined): boolean =>
  state !== undefined && TERMINAL_STATES.has(state.state);

export const isSubagentFinished = (state: SubagentWorkState | undefined): boolean =>
  state !== undefined && FINISHED_STATES.has(state.state);

export const subagentNeedsInput = (child: SubagentSnapshot): boolean =>
  child.pendingPermission !== undefined ||
  child.pendingElicitation !== undefined ||
  child.state?.state === WORK_STATE.requiresAction;

/** Transcript items to show: a `session/load` replays the task as the child's first user message, which the Subagent task row already shows. */
export const subagentTranscriptItems = (child: SubagentSnapshot): SessionTranscript['items'] => {
  const [first, ...rest] = child.transcript.items;
  return first?.kind === 'user_message' && child.task !== undefined && first.text.trim() === child.task.trim()
    ? rest
    : child.transcript.items;
};

/** Child cancel is offered only for an explicit `cancel: {}` grant (missing/null = unsupported). */
export const canCancelSubagent = (child: SubagentSnapshot): boolean =>
  isRecord(child.capabilities?.cancel) && Object.keys(child.capabilities.cancel).length === 0;

/** Decode a subagent announcement/patch; none when the id is missing or a field is malformed. */
export const decodeSubagentUpdate: (update: unknown) => Option.Option<SubagentUpdate> =
  Schema.decodeUnknownOption(SubagentUpdate);

const toWorkState = (value: NonNullable<SubagentUpdate['state']>): SubagentWorkState =>
  typeof value === 'string'
    ? { state: value }
    : {
        state: value.state,
        ...(value.stopReason === undefined || value.stopReason === null ? {} : { stopReason: value.stopReason }),
        ...(value.error === undefined || value.error === null ? {} : { error: value.error }),
      };

/** `early` is a stray root entry holding updates and requests that arrived before the spawn. */
export const initialSubagentSnapshot = (
  sessionId: string,
  parentSessionId: string,
  early?: Pick<SubagentSnapshotBase, 'pendingElicitation' | 'pendingPermission' | 'transcript'>,
): NativeSubagentSnapshot =>
  withoutUndefined({
    kind: 'native' as const,
    parentSessionId,
    pendingElicitation: early?.pendingElicitation,
    pendingPermission: early?.pendingPermission,
    sessionId,
    transcript: early?.transcript ?? emptySessionTranscript(),
  });

/** A Spawned subagent session's first snapshot: it lives on `launchTarget`'s connection, not the parent's. */
export const initialSpawnedSubagentSnapshot = (
  sessionId: string,
  parentSessionId: string,
  launchTarget: AgentLaunchTarget,
): SubagentSnapshot => ({ ...initialSubagentSnapshot(sessionId, parentSessionId), kind: 'spawned', launchTarget });

/** The Harness sets a Spawned subagent session's Work state itself (its agent announces nothing). */
export const withSubagentWorkState = (child: SubagentSnapshot, state: SubagentWorkState): SubagentSnapshot =>
  withoutUndefined({ ...child, state, stateUnconfirmed: undefined });

/** Nullable patch: omitted = unchanged, null = clear, concrete = replace whole field. */
const patchField = <T, U>(
  incoming: U | null | undefined,
  current: T | undefined,
  map: (value: U) => T,
): T | undefined => (incoming === undefined ? current : incoming === null ? undefined : map(incoming));

const identity = <T>(value: T): T => value;

/** Fold a decoded `subagent_spawned` / `subagent_state_update` / `subagent_update` into the child snapshot. */
export const applySubagentPatch = (child: SubagentSnapshot, update: SubagentUpdate): SubagentSnapshot =>
  withoutUndefined({
    ...child,
    capabilities: patchField(update.capabilities, child.capabilities, identity),
    name: patchField(update.name, child.name, identity),
    state: patchField(update.state, child.state, toWorkState),
    stateUnconfirmed: update.state === undefined ? child.stateUnconfirmed : undefined,
    task: patchField(update.task, child.task, identity),
  });

/** Connection loss / load / resume: keep transcripts, drop anything that could be stale. */
export const resetSubagentLiveState = (child: SubagentSnapshot): SubagentSnapshot => {
  child.pendingPermission?.resolve({ outcome: { outcome: 'cancelled' } });
  child.pendingElicitation?.resolve({ action: 'cancel' });
  const {
    capabilities: _c,
    pendingElicitation: _e,
    pendingPermission: _p,
    state,
    stateUnconfirmed: _u,
    ...rest
  } = child;
  // Terminal states cannot revert; anything else (running, idle, requires_action, missing) may be stale.
  return isSubagentTerminal(state) ? { ...rest, state } : { ...rest, stateUnconfirmed: true };
};

/** Root ancestor of a child (walks parentSessionId through `subagents`); cycle-safe. */
export const rootAncestorId = (subagents: SubagentRecord, sessionId: string): string =>
  rootAncestor(id => getSubagent(subagents, id)?.parentSessionId, sessionId);

/** A Subagent of `kind` rooted at `sessionId` is `running` or `requires_action`. */
export const hasWorkingSubagent = (
  subagents: SubagentRecord,
  sessionId: string,
  kind: SubagentSnapshot['kind'],
): boolean =>
  Object.values(subagents).some(
    child =>
      child.kind === kind &&
      rootAncestorId(subagents, child.sessionId) === sessionId &&
      (child.state?.state === WORK_STATE.running || child.state?.state === WORK_STATE.requiresAction),
  );

/**
 * Background follow-up (glossary): an active Session with no Pending client request and a native Subagent descendant
 * that is `running` or `requires_action`. The Agent works on its own after its Prompt turn ended (AIR `backgroundSubagents`).
 */
export const hasBackgroundActivity = (
  snapshot: { readonly sessions: Readonly<Record<string, SessionSnapshot>>; readonly subagents: SubagentRecord },
  sessionId: string,
): boolean => {
  const session = getSession(snapshot.sessions, sessionId);
  return (
    session?.status === 'active' &&
    session.pendingClientRequest === undefined &&
    hasWorkingSubagent(snapshot.subagents, sessionId, 'native')
  );
};

/** A Prompt turn is in flight on `session`, or it has Background follow-up. */
export const sessionHasLiveWork = (
  snapshot: { readonly sessions: Readonly<Record<string, SessionSnapshot>>; readonly subagents: SubagentRecord },
  session: SessionSnapshot,
): boolean => session.pendingClientRequest === 'prompt' || hasBackgroundActivity(snapshot, session.sessionId);

export const directChildren = (subagents: SubagentRecord, parentSessionId: string): readonly SubagentSnapshot[] =>
  Object.values(subagents).filter(child => child.parentSessionId === parentSessionId);

/** Reduce a regular `session/update` for a child session into its transcript. */
export const reduceSubagentTranscriptUpdate = (child: SubagentSnapshot, update: unknown): SubagentSnapshot => {
  const transcript = reduceSessionUpdate(child.transcript, update);
  return transcript === child.transcript ? child : { ...child, transcript };
};

/** One-line latest activity for a row. */
export const subagentLatestActivity = (child: SubagentSnapshot): string | undefined =>
  latestTranscriptActivity(child.transcript);

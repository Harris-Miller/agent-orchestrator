/** Pure subagent-session model: wire decode, child snapshot, and nullable-patch reducer. */
import { isRecord } from '../isRecord.ts';
import { optString, withoutUndefined } from '../optionalFields.ts';

import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import { emptySessionTranscript, reduceSessionUpdate } from './sessionUpdateReducer.ts';
import type { SessionTranscript } from './sessionUpdateReducer.ts';

/** Open union: `completed`/`idle` finished, `running`/`requires_action` live, anything else renders neutral. */
export type SubagentWorkState = {
  readonly error?: unknown;
  readonly state: string;
  readonly stopReason?: string;
};

export type SubagentSnapshot = {
  /** Replaced whole by each patch; undefined = none/unconfirmed. */
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly name?: string;
  readonly parentSessionId: string;
  readonly pendingElicitation?: PendingElicitation;
  readonly pendingPermission?: PendingPermission;
  readonly sessionId: string;
  /** Undefined until a state update arrives (and again after load/resume/connection loss). */
  readonly state?: SubagentWorkState;
  readonly task?: string;
  readonly transcript: SessionTranscript;
};

export type SubagentRecord = Readonly<Record<string, SubagentSnapshot>>;

/** Typed lookup (Record indexing is not `| undefined`). */
export const getSubagent = (subagents: SubagentRecord, sessionId: string): SubagentSnapshot | undefined =>
  sessionId in subagents ? subagents[sessionId] : undefined;

const FINISHED_STATES = new Set(['completed', 'idle']);

export const isSubagentFinished = (state: SubagentWorkState | undefined): boolean =>
  state !== undefined && FINISHED_STATES.has(state.state);

export const subagentNeedsInput = (child: SubagentSnapshot): boolean =>
  child.pendingPermission !== undefined ||
  child.pendingElicitation !== undefined ||
  child.state?.state === 'requires_action';

/** Child cancel is offered only for an explicit `cancel: {}` grant (missing/null = unsupported). */
export const canCancelSubagent = (child: SubagentSnapshot): boolean =>
  isRecord(child.capabilities?.cancel) && Object.keys(child.capabilities.cancel).length === 0;

/** Accepts `"completed"` or RFD `{state, stopReason?, error?}`; anything else is undefined. */
export const parseSubagentWorkState = (value: unknown): SubagentWorkState | undefined => {
  if (typeof value === 'string') {
    return { state: value };
  }
  if (!isRecord(value) || typeof value.state !== 'string') {
    return undefined;
  }
  return {
    state: value.state,
    ...(typeof value.stopReason === 'string' ? { stopReason: value.stopReason } : {}),
    ...(value.error === undefined || value.error === null ? {} : { error: value.error }),
  };
};

export const initialSubagentSnapshot = (sessionId: string, parentSessionId: string): SubagentSnapshot => ({
  parentSessionId,
  sessionId,
  transcript: emptySessionTranscript(),
});

const parseCapabilities = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  isRecord(value) ? value : undefined;

/** Nullable patch: omitted = unchanged, null = clear, concrete = replace whole field. */
const patchField = <T>(
  update: Readonly<Record<string, unknown>>,
  key: string,
  current: T | undefined,
  parse: (value: unknown) => T | undefined,
): T | undefined => {
  if (!(key in update) || update[key] === undefined) {
    return current;
  }
  return update[key] === null ? undefined : parse(update[key]);
};

/** Fold a `subagent_spawned` / `subagent_state_update` / `subagent_update` into the child snapshot. */
export const applySubagentPatch = (
  child: SubagentSnapshot,
  update: Readonly<Record<string, unknown>>,
): SubagentSnapshot =>
  withoutUndefined({
    ...child,
    capabilities: patchField(update, 'capabilities', child.capabilities, parseCapabilities),
    name: patchField(update, 'name', child.name, optString),
    state: patchField(update, 'state', child.state, parseSubagentWorkState),
    task: patchField(update, 'task', child.task, optString),
  });

export const subagentSessionIdOf = (update: unknown): string | undefined =>
  isRecord(update) && typeof update.subagentSessionId === 'string' && update.subagentSessionId.length > 0
    ? update.subagentSessionId
    : undefined;

/** Connection loss / load / resume: keep transcripts, drop anything that could be stale. */
export const resetSubagentLiveState = (child: SubagentSnapshot): SubagentSnapshot => {
  child.pendingPermission?.resolve({ outcome: { outcome: 'cancelled' } });
  child.pendingElicitation?.resolve({ action: 'cancel' });
  const { capabilities: _c, pendingElicitation: _e, pendingPermission: _p, state: _s, ...rest } = child;
  return rest;
};

/** Root ancestor of a child (walks parentSessionId through `subagents`); cycle-safe. */
export const rootAncestorId = (subagents: SubagentRecord, sessionId: string): string => {
  const seen = new Set<string>();
  let current = sessionId;
  while (current in subagents && !seen.has(current)) {
    seen.add(current);
    current = subagents[current].parentSessionId;
  }
  return current;
};

export const directChildren = (subagents: SubagentRecord, parentSessionId: string): readonly SubagentSnapshot[] =>
  Object.values(subagents).filter(child => child.parentSessionId === parentSessionId);

/** Reduce a regular `session/update` for a child session into its transcript. */
export const reduceSubagentTranscriptUpdate = (child: SubagentSnapshot, update: unknown): SubagentSnapshot => {
  const transcript = reduceSessionUpdate(child.transcript, update);
  return transcript === child.transcript ? child : { ...child, transcript };
};

const MAX_ACTIVITY_LENGTH = 80;

/** One-line latest activity for a row: last tool title, else last agent message truncated. */
export const subagentLatestActivity = (child: SubagentSnapshot): string | undefined => {
  for (let i = child.transcript.items.length - 1; i >= 0; i -= 1) {
    const item = child.transcript.items[i];
    if (item.kind === 'tool_call') return item.title;
    if (item.kind === 'agent_message' && item.text.trim().length > 0) {
      const line = item.text.trim().replace(/\s+/g, ' ');
      return line.length > MAX_ACTIVITY_LENGTH ? `${line.slice(0, MAX_ACTIVITY_LENGTH - 1)}…` : line;
    }
  }
  return undefined;
};

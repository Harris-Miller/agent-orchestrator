/** Pure routing of session/update (and pending interactions) between root sessions and subagent children. */
import { Option } from 'effect';

import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import { upsertSubagentChatItem } from './sessionUpdateReducer.ts';
import type { SessionTranscript } from './sessionUpdateReducer.ts';
import { isRecord } from '../isRecord.ts';
import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import {
  applySubagentPatch,
  decodeSubagentUpdate,
  getSubagent,
  initialSubagentSnapshot,
  reduceSubagentTranscriptUpdate,
  resetSubagentLiveState,
  rootAncestorId,
} from './subagent.ts';

const SUBAGENT_KINDS = new Set(['subagent_spawned', 'subagent_state_update', 'subagent_update']);

export type SubagentRouteResult = {
  readonly snapshot: BackendHarnessSnapshot;
  /** Child newly linked to a parent (for tracing). */
  readonly linked?: { readonly childId: string; readonly parentId: string };
};

const withParentChatItem = (
  snapshot: BackendHarnessSnapshot,
  parentId: string,
  childId: string,
): BackendHarnessSnapshot => {
  const add = (transcript: SessionTranscript) => upsertSubagentChatItem(transcript, childId);
  const parentChild = getSubagent(snapshot.subagents, parentId);
  if (parentChild !== undefined) {
    return {
      ...snapshot,
      subagents: { ...snapshot.subagents, [parentId]: { ...parentChild, transcript: add(parentChild.transcript) } },
    };
  }
  const parent = parentId in snapshot.sessions ? snapshot.sessions[parentId] : initialSessionSnapshot(parentId);
  return {
    ...snapshot,
    sessions: { ...snapshot.sessions, [parentId]: { ...parent, transcript: add(parent.transcript) } },
  };
};

/**
 * Handle updates that belong to the subagent tree. Returns undefined when the update is a plain root-session
 * update (unseen ids fall through: a root's first updates can precede its `session/new` response).
 */
export const routeSubagentUpdate = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  update: unknown,
): SubagentRouteResult | undefined => {
  if (isRecord(update) && typeof update.sessionUpdate === 'string' && SUBAGENT_KINDS.has(update.sessionUpdate)) {
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
  if (child === undefined) return undefined;
  const next = reduceSubagentTranscriptUpdate(child, update);
  return {
    snapshot: next === child ? snapshot : { ...snapshot, subagents: { ...snapshot.subagents, [sessionId]: next } },
  };
};

type SessionOrSubagent = {
  readonly pendingElicitation?: PendingElicitation | undefined;
  readonly pendingPermission?: PendingPermission | undefined;
  readonly transcript: SessionTranscript;
};

/** Apply `patch` to whichever of root session or subagent child owns `sessionId`. */
export const patchSessionOrSubagent = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  patch: <T extends SessionOrSubagent>(current: T) => T,
): BackendHarnessSnapshot => {
  const child = getSubagent(snapshot.subagents, sessionId);
  if (child !== undefined) {
    return { ...snapshot, subagents: { ...snapshot.subagents, [sessionId]: patch(child) } };
  }
  const session = snapshot.sessions[sessionId] ?? initialSessionSnapshot(sessionId);
  return { ...snapshot, sessions: { ...snapshot.sessions, [sessionId]: patch(session) } };
};

export const sessionOrSubagentOf = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
): SessionOrSubagent | undefined =>
  getSubagent(snapshot.subagents, sessionId) ??
  (sessionId in snapshot.sessions ? snapshot.sessions[sessionId] : undefined);

/** Reset live child state for every descendant of a root session being (re)loaded or resumed. */
export const resetSubagentsOfRoot = (snapshot: BackendHarnessSnapshot, rootId: string): BackendHarnessSnapshot => ({
  ...snapshot,
  subagents: Object.fromEntries(
    Object.entries(snapshot.subagents).map(([id, child]) => [
      id,
      rootAncestorId(snapshot.subagents, id) === rootId ? resetSubagentLiveState(child) : child,
    ]),
  ),
});

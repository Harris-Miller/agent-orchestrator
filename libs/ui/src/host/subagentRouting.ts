/** Pure helpers addressing a root Session or a Subagent session by id (pending interactions, parent rows, resets). */
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import type { PendingHolder } from './pendingInteractions.ts';
import { upsertSubagentChatItem } from './sessionUpdateReducer.ts';
import type { SessionTranscript } from './sessionUpdateReducer.ts';
import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { getSubagent, resetSubagentLiveState, rootAncestorId } from './subagent.ts';
import type { SubagentSnapshot } from './subagent.ts';

/**
 * A Native subagent only: a Spawned subagent's mirror is projected from its root entry (ADR 0011), so its requests and
 * answers address the root entry, even when the child shares the parent's launch target and so this snapshot.
 */
const nativeSubagent = (snapshot: BackendHarnessSnapshot, sessionId: string): SubagentSnapshot | undefined => {
  const child = getSubagent(snapshot.subagents, sessionId);
  return child?.kind === 'spawned' && sessionId in snapshot.sessions ? undefined : child;
};

export const withParentChatItem = (
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

type SessionOrSubagent = PendingHolder & { readonly transcript: SessionTranscript };

/** Apply `patch` to whichever of root session or subagent child owns `sessionId`. */
export const patchSessionOrSubagent = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
  patch: <T extends SessionOrSubagent>(current: T) => T,
): BackendHarnessSnapshot => {
  const child = nativeSubagent(snapshot, sessionId);
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
  nativeSubagent(snapshot, sessionId) ?? (sessionId in snapshot.sessions ? snapshot.sessions[sessionId] : undefined);

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

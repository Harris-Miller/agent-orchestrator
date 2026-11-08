/** Turn activity: whether any Prompt turn is working, i.e. whether the Keep-awake hold is wanted. */
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import { hasPendingInteraction } from './pendingInteractions.ts';
import { rootAncestorId } from './subagent.ts';

/** Sessions whose turn is blocked on the user: a Pending interaction on the Session or any of its Subagent sessions. */
const blockedSessionIds = (snapshot: BackendHarnessSnapshot): ReadonlySet<string> => {
  const blocked = new Set<string>();
  for (const session of Object.values(snapshot.sessions)) {
    if (hasPendingInteraction(session)) {
      blocked.add(session.sessionId);
    }
  }
  for (const child of Object.values(snapshot.subagents)) {
    if (hasPendingInteraction(child)) {
      blocked.add(rootAncestorId(snapshot.subagents, child.sessionId));
    }
  }
  return blocked;
};

const harnessWorking = (snapshot: BackendHarnessSnapshot): boolean => {
  const prompting = Object.values(snapshot.sessions).filter(session => session.pendingClientRequest === 'prompt');
  if (prompting.length === 0) {
    return false;
  }
  const blocked = blockedSessionIds(snapshot);
  return prompting.some(session => !blocked.has(session.sessionId));
};

/**
 * True while any Session on any Backend harness has a Prompt turn in flight that is not blocked on a Pending
 * permission / elicitation (its own or a Subagent session's). Config changes, Bootstrap and installs never count.
 */
export const anyPromptTurnWorking = (snapshots: readonly BackendHarnessSnapshot[]): boolean =>
  snapshots.some(harnessWorking);

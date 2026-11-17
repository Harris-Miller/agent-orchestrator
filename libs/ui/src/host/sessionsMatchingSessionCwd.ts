import { resolveSessionCwd } from './acpSessionBootstrap.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from './agentLaunchTarget.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

type SessionLike = {
  readonly cwd?: string;
  readonly pendingClientRequest?: 'config' | 'prompt' | undefined;
  readonly sessionId: string;
  readonly status: 'activating' | 'active' | 'inactive';
};

type SnapshotLike = {
  readonly sessionHistory: readonly { readonly cwd: string; readonly sessionId: string }[];
  readonly sessions: Readonly<Record<string, SessionLike>>;
};

export type MatchedSession = {
  readonly launchTarget: AgentLaunchTarget;
  readonly pendingClientRequest: 'config' | 'prompt' | undefined;
  readonly sessionId: string;
};

/**
 * Active + activating sessions whose resolved Session cwd equals `previousSessionCwd`
 * (exact equality, including both undefined), except Spawned subagent sessions.
 */
export const sessionsMatchingSessionCwd = (
  getSnapshot: (launchTarget: AgentLaunchTarget) => SnapshotLike,
  previousSessionCwd: string | undefined,
  /** A Spawned subagent session is not matched: its parent's deactivation ends it. */
  isLinkedChild: (launchTarget: AgentLaunchTarget, sessionId: string) => boolean,
): readonly MatchedSession[] => {
  const matches: MatchedSession[] = [];
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    const snapshot = getSnapshot(launchTarget);
    for (const session of Object.values(snapshot.sessions)) {
      if (
        (session.status === 'active' || session.status === 'activating') &&
        !isLinkedChild(launchTarget, session.sessionId)
      ) {
        const historyEntry = snapshot.sessionHistory.find(entry => entry.sessionId === session.sessionId);
        if (resolveSessionCwd(session.cwd, historyEntry?.cwd) === previousSessionCwd) {
          matches.push({
            launchTarget,
            pendingClientRequest: session.pendingClientRequest,
            sessionId: session.sessionId,
          });
        }
      }
    }
  }
  return matches;
};

export const firstFolderPath = (paths: readonly string[]): string | undefined => {
  if (paths.length === 0) {
    return undefined;
  }
  const [first] = paths;
  return first;
};

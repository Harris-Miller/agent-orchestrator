import { resolveSessionCwd } from '@lib/ui/acp-session-bootstrap';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '@lib/ui/agent-launch-target';
import type { AgentLaunchTarget } from '@lib/ui/agent-launch-target';

type SessionLike = {
  readonly cwd?: string;
  readonly pendingClientRequest?: 'config' | 'prompt' | undefined;
  readonly sessionId: string;
  readonly status: 'activating' | 'active' | 'inactive';
};

type SnapshotLike = {
  readonly sessionRoster: readonly { readonly cwd: string; readonly sessionId: string }[];
  readonly sessions: Readonly<Record<string, SessionLike>>;
};

export type MatchedSession = {
  readonly launchTarget: AgentLaunchTarget;
  readonly pendingClientRequest: 'config' | 'prompt' | undefined;
  readonly sessionId: string;
};

/**
 * Active + activating sessions whose resolved Session cwd equals `previousSessionCwd`
 * (exact equality, including both undefined).
 */
export const sessionsMatchingSessionCwd = (
  getSnapshot: (launchTarget: AgentLaunchTarget) => SnapshotLike,
  previousSessionCwd: string | undefined,
): readonly MatchedSession[] => {
  const matches: MatchedSession[] = [];
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    const snapshot = getSnapshot(launchTarget);
    for (const session of Object.values(snapshot.sessions)) {
      if (session.status === 'active' || session.status === 'activating') {
        const rosterEntry = snapshot.sessionRoster.find(entry => entry.sessionId === session.sessionId);
        if (resolveSessionCwd(session.cwd, rosterEntry?.cwd) === previousSessionCwd) {
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

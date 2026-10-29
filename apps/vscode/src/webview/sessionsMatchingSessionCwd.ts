import { resolveSessionCwd } from '@lib/ui/acp-session-bootstrap';

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

/** Launch targets the vscode webview mounts (keep in sync with AcpBackendsMount). */
const MOUNTED_LAUNCH_TARGETS = ['codex-acp', 'claude-agent-acp', 'gemini-acp', 'cursor-acp'] as const;

export type MatchedSession = {
  readonly launchTarget: (typeof MOUNTED_LAUNCH_TARGETS)[number];
  readonly pendingClientRequest: 'config' | 'prompt' | undefined;
  readonly sessionId: string;
};

/**
 * Active + activating sessions whose resolved Session cwd equals `previousSessionCwd`
 * (exact equality, including both undefined).
 */
export const sessionsMatchingSessionCwd = (
  getSnapshot: (launchTarget: (typeof MOUNTED_LAUNCH_TARGETS)[number]) => SnapshotLike,
  previousSessionCwd: string | undefined,
): readonly MatchedSession[] => {
  const matches: MatchedSession[] = [];
  for (const launchTarget of MOUNTED_LAUNCH_TARGETS) {
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

import { isSessionActiveOrActivating } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { SessionTarget } from './projectSessions.ts';

/**
 * The active (or activating) sessions to reactivate when Experimental: App Orchestrated Agents changes, across every launch
 * target. `exclude` drops sessions that must not be reactivated this way (Spawned subagent sessions end with their parent;
 * the Bound Virtual session is rebound instead).
 */
export const sessionsToReactivate = (
  snapshots: readonly { readonly launchTarget: AgentLaunchTarget; readonly snapshot: BackendHarnessSnapshot }[],
  exclude: (target: SessionTarget) => boolean,
): readonly SessionTarget[] =>
  snapshots.flatMap(({ launchTarget, snapshot }) =>
    Object.values(snapshot.sessions).flatMap(session => {
      const target = { launchTarget, sessionId: session.sessionId };
      return isSessionActiveOrActivating(session.status) && !exclude(target) ? [target] : [];
    }),
  );

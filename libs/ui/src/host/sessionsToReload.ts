import { isSessionActiveOrActivating } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { SessionTarget } from './projectSessions.ts';

/**
 * The active (or activating) sessions to reload when Experimental: App Orchestrated Agents changes, across every launch
 * target. `exclude` drops sessions that must not be reloaded this way (Spawned subagent sessions end with their parent;
 * the Bound Virtual session is rebound instead).
 */
export const sessionsToReload = (
  snapshots: readonly { readonly launchTarget: AgentLaunchTarget; readonly snapshot: BackendHarnessSnapshot }[],
  exclude: (target: SessionTarget) => boolean,
): readonly SessionTarget[] =>
  snapshots.flatMap(({ launchTarget, snapshot }) =>
    Object.values(snapshot.sessions).flatMap(session => {
      const target = { launchTarget, sessionId: session.sessionId };
      return isSessionActiveOrActivating(session.status) && !exclude(target) ? [target] : [];
    }),
  );

/** Remembers the last settled value of a boolean setting; `changed` is true only when a later value differs (never for the first). */
export const makeChangeTracker = () => {
  let last: boolean | undefined;
  return {
    changed: (next: boolean): boolean => {
      const result = last !== undefined && last !== next;
      last = next;
      return result;
    },
  };
};

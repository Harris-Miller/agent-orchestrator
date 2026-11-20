/** Idle session sweep (glossary): which active Sessions of one launch target are idle enough to close. Pure. */
import type { BackendHarnessSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import { rootAncestorId, sessionHasLiveWork, WORK_STATE } from './subagent.ts';

/** How often the sweep runs. */
export const IDLE_SWEEP_INTERVAL_MS = 60_000;

/** Idle threshold (glossary): how far past `updatedAt` a Session must be before the sweep may close it. */
export const IDLE_THRESHOLD_MS = 10 * 60_000;

/**
 * Live work for the sweep: a Prompt turn, Background follow-up, or a running Spawned subagent mirror. Closing the parent
 * ends spawned children (`endLinksOfParent`), so they count here; `stateUnconfirmed` subagents (no state) never do.
 */
export const sessionIsBusy = (snapshot: BackendHarnessSnapshot, session: SessionSnapshot): boolean =>
  sessionHasLiveWork(snapshot, session) ||
  Object.values(snapshot.subagents).some(
    child =>
      child.kind === 'spawned' &&
      rootAncestorId(snapshot.subagents, child.sessionId) === session.sessionId &&
      (child.state?.state === WORK_STATE.running || child.state?.state === WORK_STATE.requiresAction),
  );

export type SelectIdleSessionsInput = {
  readonly handoffInProgress: boolean;
  readonly now: number;
  readonly selectedSessionId: string | undefined;
  readonly snapshot: BackendHarnessSnapshot;
  readonly thresholdMs: number;
};

/** Ids of the Sessions the sweep should close now on this launch target's snapshot. */
export const selectIdleSessions = ({
  handoffInProgress,
  now,
  selectedSessionId,
  snapshot,
  thresholdMs,
}: SelectIdleSessionsInput): readonly string[] => {
  if (handoffInProgress || !snapshot.agentCapabilities.sessionClose) {
    return [];
  }
  return snapshot.sessionHistory.flatMap(entry => {
    const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
    if (session?.status !== 'active' || session.sessionId === selectedSessionId || sessionIsBusy(snapshot, session)) {
      return [];
    }
    const updatedAt = entry.updatedAt === undefined ? Number.NaN : Date.parse(entry.updatedAt);
    return now - updatedAt > thresholdMs ? [session.sessionId] : [];
  });
};

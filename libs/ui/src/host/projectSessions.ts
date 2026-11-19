import { isSessionActiveOrActivating, resolveSessionCwd } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';

/** A session's cwd: snapshot cwd, else its History row's cwd (ADR 0005 resolve). One rule for Project membership. */
export const sessionCwdInSnapshot = (snapshot: BackendHarnessSnapshot, sessionId: string): string | undefined =>
  resolveSessionCwd(
    sessionId in snapshot.sessions ? snapshot.sessions[sessionId].cwd : undefined,
    snapshot.sessionHistory.find(entry => entry.sessionId === sessionId)?.cwd,
  );

/**
 * Ids of the sessions loaded on the agent (Active session: active or activating) whose cwd is `cwd`. `boundVirtual` is
 * the Virtual session's Bound session, which counts even before it has a History row. A Virtual draft with no Bound
 * session is not a session on the agent and never appears here.
 */
export const activeSessionsInCwd = (
  snapshot: BackendHarnessSnapshot,
  cwd: string,
  boundVirtual?: { readonly cwd: string | undefined; readonly sessionId: string },
): readonly string[] =>
  Object.values(snapshot.sessions).flatMap(session => {
    if (!isSessionActiveOrActivating(session.status)) return [];
    const sessionCwd =
      sessionCwdInSnapshot(snapshot, session.sessionId) ??
      (boundVirtual?.sessionId === session.sessionId ? boundVirtual.cwd : undefined);
    return sessionCwd === cwd ? [session.sessionId] : [];
  });

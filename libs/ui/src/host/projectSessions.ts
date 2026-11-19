import type { Selected } from '../atoms/backendState.atoms.ts';
import { isSessionActiveOrActivating, resolveSessionCwd } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

/** A session's cwd: snapshot cwd, else its History row's cwd (ADR 0005 resolve). One rule for Project membership. */
export const sessionCwdInSnapshot = (snapshot: BackendHarnessSnapshot, sessionId: string): string | undefined =>
  resolveSessionCwd(
    sessionId in snapshot.sessions ? snapshot.sessions[sessionId].cwd : undefined,
    snapshot.sessionHistory.find(entry => entry.sessionId === sessionId)?.cwd,
  );

export type ProjectSession = { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string };

export type ProjectMembership = {
  readonly activeSessions: readonly ProjectSession[];
  readonly selectedInProject: boolean;
  readonly virtualBoundInProject: boolean;
};

/**
 * Which sessions belong to the Project `cwd`. One rule: a session's cwd is its snapshot cwd (else History row cwd),
 * falling back to the Virtual blob's cwd only for the Bound Virtual session; it is in the Project when that equals `cwd`.
 * A Virtual draft with no Bound session is not a session on the agent: never counted, never bound in the Project.
 */
export const projectMembership = (
  snapshots: readonly { readonly launchTarget: AgentLaunchTarget; readonly snapshot: BackendHarnessSnapshot }[],
  virtual:
    | {
        readonly cwd: string | undefined;
        readonly launchTarget: AgentLaunchTarget | undefined;
        readonly sessionId?: string;
      }
    | null
    | undefined,
  selected: Selected | undefined,
  cwd: string,
): ProjectMembership => {
  const cwdOf = (launchTarget: AgentLaunchTarget, snapshot: BackendHarnessSnapshot, sessionId: string) =>
    sessionCwdInSnapshot(snapshot, sessionId) ??
    (virtual?.launchTarget === launchTarget && virtual.sessionId === sessionId ? virtual.cwd : undefined);
  const activeSessions = snapshots.flatMap(({ launchTarget, snapshot }) =>
    Object.values(snapshot.sessions).flatMap(session =>
      isSessionActiveOrActivating(session.status) && cwdOf(launchTarget, snapshot, session.sessionId) === cwd
        ? [{ launchTarget, sessionId: session.sessionId }]
        : [],
    ),
  );
  const boundSessionId = virtual?.sessionId;
  const virtualBoundInProject =
    boundSessionId !== undefined &&
    snapshots.some(
      ({ launchTarget, snapshot }) =>
        virtual?.launchTarget === launchTarget && cwdOf(launchTarget, snapshot, boundSessionId) === cwd,
    );
  const selectedInProject =
    selected?._tag === 'Session' &&
    snapshots.some(({ launchTarget, snapshot }) => cwdOf(launchTarget, snapshot, selected.sessionId) === cwd);
  return { activeSessions, selectedInProject, virtualBoundInProject };
};

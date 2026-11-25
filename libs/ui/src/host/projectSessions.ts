import type { Selected } from '../atoms/backendState.atoms.ts';
import type { VirtualSession } from '../atoms/virtualSession.atoms.ts';
import { isSessionActiveOrActivating, resolveSessionCwd } from './acpSessionBootstrap.ts';
import { projectOfRecord } from './projectResolution.ts';
import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

/** A session's cwd: snapshot cwd, else its History row's cwd (ADR 0005 resolve). One rule for Project membership. */
export const sessionCwdInSnapshot = (snapshot: BackendHarnessSnapshot, sessionId: string): string | undefined =>
  resolveSessionCwd(
    sessionId in snapshot.sessions ? snapshot.sessions[sessionId].cwd : undefined,
    snapshot.sessionHistory.find(entry => entry.sessionId === sessionId)?.cwd,
  );

/** A session's cwd and Workspace file, from its snapshot Session else its History row (the {@link projectOfRecord} input). */
export const sessionRecordInSnapshot = (
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
): { readonly cwd: string; readonly workspaceFile?: string } | undefined => {
  const cwd = sessionCwdInSnapshot(snapshot, sessionId);
  if (cwd === undefined) return undefined;
  const live = sessionId in snapshot.sessions ? snapshot.sessions[sessionId].workspaceFile : undefined;
  const workspaceFile = live ?? snapshot.sessionHistory.find(entry => entry.sessionId === sessionId)?.workspaceFile;
  return workspaceFile === undefined ? { cwd } : { cwd, workspaceFile };
};

/** An ACP session on one launch target. */
export type SessionTarget = { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string };

export type ProjectMembership = {
  readonly activeSessions: readonly SessionTarget[];
  readonly selectedInProject: boolean;
  readonly virtualBoundInProject: boolean;
};

/**
 * Which sessions belong to the Project `project` (a directory or a Workspace file). One rule: a session's cwd and Workspace
 * file are its snapshot's (else its History row's), falling back to the Virtual blob's only for the Bound Virtual session;
 * it is in the Project when {@link projectOfRecord} over `projects` names `project` (so a session stamped with Workspace
 * file W is never in the directory Project at its cwd while W is a Project).
 * Live Spawned subagent children (`isSpawnedChild`) are not counted: they close with their parent.
 * A Virtual draft with no Bound session is not a session on the agent: never counted, never bound in the Project.
 */
export const projectMembership = (
  snapshots: readonly { readonly launchTarget: AgentLaunchTarget; readonly snapshot: BackendHarnessSnapshot }[],
  virtual: Pick<VirtualSession, 'cwd' | 'launchTarget' | 'sessionId' | 'workspaceFile'> | null | undefined,
  selected: Selected | undefined,
  project: string,
  isSpawnedChild: (session: SessionTarget) => boolean,
  projects: readonly string[] = [project],
): ProjectMembership => {
  const inProject = (launchTarget: AgentLaunchTarget, snapshot: BackendHarnessSnapshot, sessionId: string) => {
    const record =
      sessionRecordInSnapshot(snapshot, sessionId) ??
      (virtual?.launchTarget === launchTarget && virtual.sessionId === sessionId && virtual.cwd !== undefined
        ? {
            cwd: virtual.cwd,
            ...(virtual.workspaceFile === undefined ? {} : { workspaceFile: virtual.workspaceFile }),
          }
        : undefined);
    return record !== undefined && projectOfRecord(record, projects) === project;
  };
  const activeSessions = snapshots.flatMap(({ launchTarget, snapshot }) =>
    Object.values(snapshot.sessions).flatMap(session =>
      isSessionActiveOrActivating(session.status) &&
      inProject(launchTarget, snapshot, session.sessionId) &&
      !isSpawnedChild({ launchTarget, sessionId: session.sessionId })
        ? [{ launchTarget, sessionId: session.sessionId }]
        : [],
    ),
  );
  const boundSessionId = virtual?.sessionId;
  const virtualBoundInProject =
    boundSessionId !== undefined &&
    snapshots.some(
      ({ launchTarget, snapshot }) =>
        virtual?.launchTarget === launchTarget && inProject(launchTarget, snapshot, boundSessionId),
    );
  const selectedInProject =
    selected?._tag === 'Session' &&
    snapshots.some(({ launchTarget, snapshot }) => inProject(launchTarget, snapshot, selected.sessionId));
  return { activeSessions, selectedInProject, virtualBoundInProject };
};

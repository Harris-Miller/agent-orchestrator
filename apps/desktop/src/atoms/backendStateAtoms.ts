/** Core ACP backend / session selection Atom state. */
import { Atom } from 'effect/unstable/reactivity';

import { initialBackendHarnessSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, UnifiedRosterEntry } from '../acp/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel, ALL_AGENT_LAUNCH_TARGETS } from '../acp/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';

export const selectedSessionIdAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

export const rpcWireLogLaunchTargetAtom = Atom.make<AgentLaunchTarget>('codex-acp').pipe(Atom.keepAlive);

export const backendHarnessStateAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make(initialBackendHarnessSnapshot()).pipe(Atom.withLabel(`backendState:${launchTarget}`), Atom.keepAlive),
);

export const unifiedSessionRosterAtom = Atom.make(get => {
  const entries: UnifiedRosterEntry[] = [];
  for (const launchTarget of ALL_AGENT_LAUNCH_TARGETS) {
    for (const entry of get(backendHarnessStateAtom(launchTarget)).sessionRoster) {
      entries.push({ ...entry, launchTarget });
    }
  }
  return entries;
}).pipe(Atom.keepAlive);

export const findLaunchTargetForSessionId = (
  getSnapshot: (launchTarget: AgentLaunchTarget) => BackendHarnessSnapshot,
  sessionId: string,
): AgentLaunchTarget | undefined => {
  for (const launchTarget of ALL_AGENT_LAUNCH_TARGETS) {
    const snapshot = getSnapshot(launchTarget);
    if (sessionId in snapshot.sessions || snapshot.sessionRoster.some(entry => entry.sessionId === sessionId)) {
      return launchTarget;
    }
  }
  return undefined;
};

export const selectedSessionLaunchTargetAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return undefined;
  }
  return findLaunchTargetForSessionId(launchTarget => get(backendHarnessStateAtom(launchTarget)), sessionId);
}).pipe(Atom.keepAlive);

export const selectedSessionAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  const launchTarget = get(selectedSessionLaunchTargetAtom);
  if (sessionId === undefined || launchTarget === undefined) {
    return undefined;
  }
  return get(backendHarnessStateAtom(launchTarget)).sessions[sessionId];
}).pipe(Atom.keepAlive);

export const selectedBackendHarnessSnapshotAtom = Atom.make(get => {
  const launchTarget = get(selectedSessionLaunchTargetAtom);
  if (launchTarget === undefined) {
    return undefined;
  }
  return get(backendHarnessStateAtom(launchTarget));
}).pipe(Atom.keepAlive);

export const rpcWireLogSnapshotAtom = Atom.make(get =>
  get(backendHarnessStateAtom(get(rpcWireLogLaunchTargetAtom))),
).pipe(Atom.keepAlive);

export const allLaunchTargetPhasesAtom = Atom.make(get =>
  ALL_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
    error: get(backendHarnessStateAtom(launchTarget)).error,
    label: agentLaunchTargetLabel(launchTarget),
    launchTarget,
    phase: get(backendHarnessStateAtom(launchTarget)).phase,
  })),
).pipe(Atom.keepAlive);

export const clearSelectedSessionIfMissing = (get: Atom.FnContext) => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return;
  }
  if (
    findLaunchTargetForSessionId(launchTarget => get(backendHarnessStateAtom(launchTarget)), sessionId) === undefined
  ) {
    get.set(selectedSessionIdAtom, undefined);
  }
};

export const selectSession = (get: Atom.FnContext, launchTarget: AgentLaunchTarget, sessionId: string) => {
  get.set(selectedSessionIdAtom, sessionId);
  get.set(rpcWireLogLaunchTargetAtom, launchTarget);
};

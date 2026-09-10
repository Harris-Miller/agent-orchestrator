/** Core ACP backend / session selection Atom state. */
import { Atom } from 'effect/unstable/reactivity';

import {
  agentLaunchTargetLabel,
  ALL_AGENT_LAUNCH_TARGETS,
  initialBackendHarnessSnapshot,
} from '../acp/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, UnifiedRosterEntry } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentHarness.ts';
import { readProviderConfig } from '../acp/providerConfigStorage.ts';
import type { ProviderConfigStored } from '../acp/providerConfigStorage.ts';

import type { AcpAtomGet } from './acpRuntime.ts';

export const providerConfigAtom = Atom.family((backend: AgentLaunchTarget) =>
  Atom.make<ProviderConfigStored | undefined>(readProviderConfig(backend)).pipe(
    Atom.withLabel(`providerConfig:${backend}`),
    Atom.keepAlive,
  ),
);

export const selectedSessionIdAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

export const rpcWireLogLaunchTargetAtom = Atom.make<AgentLaunchTarget>('codex-acp').pipe(Atom.keepAlive);

export const backendHarnessStateAtom = Atom.family((backend: AgentLaunchTarget) =>
  Atom.make(initialBackendHarnessSnapshot()).pipe(Atom.withLabel(`backendState:${backend}`), Atom.keepAlive),
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
  getSnapshot: (backend: AgentLaunchTarget) => BackendHarnessSnapshot,
  sessionId: string,
): AgentLaunchTarget | undefined => {
  for (const backend of ALL_AGENT_LAUNCH_TARGETS) {
    const snapshot = getSnapshot(backend);
    if (sessionId in snapshot.sessions || snapshot.sessionRoster.some(entry => entry.sessionId === sessionId)) {
      return backend;
    }
  }
  return undefined;
};

export const selectedSessionLaunchTargetAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return undefined;
  }
  return findLaunchTargetForSessionId(backend => get(backendHarnessStateAtom(backend)), sessionId);
}).pipe(Atom.keepAlive);

export const selectedSessionAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  const backend = get(selectedSessionLaunchTargetAtom);
  if (sessionId === undefined || backend === undefined) {
    return undefined;
  }
  return get(backendHarnessStateAtom(backend)).sessions[sessionId];
}).pipe(Atom.keepAlive);

export const selectedBackendHarnessSnapshotAtom = Atom.make(get => {
  const backend = get(selectedSessionLaunchTargetAtom);
  if (backend === undefined) {
    return undefined;
  }
  return get(backendHarnessStateAtom(backend));
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

export const clearSelectedSessionIfMissing = (get: AcpAtomGet) => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return;
  }
  if (findLaunchTargetForSessionId(backend => get(backendHarnessStateAtom(backend)), sessionId) === undefined) {
    get.set(selectedSessionIdAtom, undefined);
  }
};

export const selectSession = (get: AcpAtomGet, backend: AgentLaunchTarget, sessionId: string) => {
  get.set(selectedSessionIdAtom, sessionId);
  get.set(rpcWireLogLaunchTargetAtom, backend);
};

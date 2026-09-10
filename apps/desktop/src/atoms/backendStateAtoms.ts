/** Core ACP backend / session selection Atom state. */
import { Atom } from 'effect/unstable/reactivity';

import { ALL_ACP_BACKENDS, backendLabel, initialBackendSnapshot } from '../prototype/agentChat/acpSessionBootstrap.ts';
import type { BackendSnapshot, UnifiedRosterEntry } from '../prototype/agentChat/acpSessionBootstrap.ts';
import type { AcpAgentBackend } from '../prototype/agentChat/agentHarness.ts';
import { readProviderConfig } from '../prototype/agentChat/providerConfigStorage.ts';
import type { ProviderConfigStored } from '../prototype/agentChat/providerConfigStorage.ts';

import type { AcpAtomGet } from './acpRuntime.ts';

export const providerConfigAtom = Atom.family((backend: AcpAgentBackend) =>
  Atom.make<ProviderConfigStored | undefined>(readProviderConfig(backend)).pipe(
    Atom.withLabel(`providerConfig:${backend}`),
    Atom.keepAlive,
  ),
);

export const selectedSessionIdAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

/** True while a multi-step Handoff pipeline is running (covers gaps between RPCs). */
export const handoffInProgressAtom = Atom.make(false).pipe(Atom.keepAlive);

export const rpcWireLogBackendAtom = Atom.make<AcpAgentBackend>('codex-acp').pipe(Atom.keepAlive);

export const backendStateAtom = Atom.family((backend: AcpAgentBackend) =>
  Atom.make(initialBackendSnapshot()).pipe(Atom.withLabel(`backendState:${backend}`), Atom.keepAlive),
);

export const draftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

export const unifiedSessionRosterAtom = Atom.make(get => {
  const entries: UnifiedRosterEntry[] = [];
  for (const backend of ALL_ACP_BACKENDS) {
    for (const entry of get(backendStateAtom(backend)).sessionRoster) {
      entries.push({ ...entry, backend });
    }
  }
  return entries;
}).pipe(Atom.keepAlive);

export const findBackendForSessionId = (
  getSnapshot: (backend: AcpAgentBackend) => BackendSnapshot,
  sessionId: string,
): AcpAgentBackend | undefined => {
  for (const backend of ALL_ACP_BACKENDS) {
    const snapshot = getSnapshot(backend);
    if (sessionId in snapshot.sessions || snapshot.sessionRoster.some(entry => entry.sessionId === sessionId)) {
      return backend;
    }
  }
  return undefined;
};

export const selectedSessionBackendAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return undefined;
  }
  return findBackendForSessionId(backend => get(backendStateAtom(backend)), sessionId);
}).pipe(Atom.keepAlive);

export const selectedSessionAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  const backend = get(selectedSessionBackendAtom);
  if (sessionId === undefined || backend === undefined) {
    return undefined;
  }
  return get(backendStateAtom(backend)).sessions[sessionId];
}).pipe(Atom.keepAlive);

export const selectedSessionSnapshotAtom = Atom.make(get => {
  const backend = get(selectedSessionBackendAtom);
  if (backend === undefined) {
    return undefined;
  }
  return get(backendStateAtom(backend));
}).pipe(Atom.keepAlive);

export const rpcWireLogSnapshotAtom = Atom.make(get => get(backendStateAtom(get(rpcWireLogBackendAtom)))).pipe(
  Atom.keepAlive,
);

export const allBackendPhasesAtom = Atom.make(get =>
  ALL_ACP_BACKENDS.map(backend => ({
    backend,
    error: get(backendStateAtom(backend)).error,
    label: backendLabel(backend),
    phase: get(backendStateAtom(backend)).phase,
  })),
).pipe(Atom.keepAlive);

export const clearSelectedSessionIfMissing = (get: AcpAtomGet) => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return;
  }
  if (findBackendForSessionId(backend => get(backendStateAtom(backend)), sessionId) === undefined) {
    get.set(selectedSessionIdAtom, undefined);
  }
};

export const selectSession = (get: AcpAtomGet, backend: AcpAgentBackend, sessionId: string) => {
  get.set(selectedSessionIdAtom, sessionId);
  get.set(rpcWireLogBackendAtom, backend);
};

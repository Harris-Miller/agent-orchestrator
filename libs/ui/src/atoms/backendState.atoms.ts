/** Core ACP backend / session selection Atom state. */
import { Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import { initialBackendHarnessSnapshot, isUsablePhase } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel, MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { isArchivedEntry } from '../host/airMeta.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configOptionIndexIsNonempty } from '../host/configProbe.ts';
import type { RuntimeJob } from '../host/providerView.ts';

export type Selected = { readonly _tag: 'Session'; readonly sessionId: string } | { readonly _tag: 'Virtual' };

export const selectedAtom = Atom.make<Selected | undefined>(undefined).pipe(Atom.keepAlive);

/** Child session currently shown full-pane (a view of `subagents[childId]`, not a Selected arm). */
export const viewedSubagentAtom = Atom.make<
  { readonly childId: string; readonly launchTarget: AgentLaunchTarget; readonly rootSessionId: string } | undefined
>(undefined).pipe(Atom.keepAlive);

/**
 * True while Virtual Bind or Materialize holds the lifecycle lock.
 * Create / Virtual-mutation helpers no-op while true; navigation (select / clear Selected) never waits on it.
 * Must not stay set during session/prompt.
 */
export const virtualLifecycleInFlightAtom = Atom.make(false).pipe(Atom.keepAlive);

/** Session arm sessionId only; undefined when Virtual or no Selected. */
export const selectedSessionIdAtom = Atom.make(get => {
  const selected = get(selectedAtom);
  return selected?._tag === 'Session' ? selected.sessionId : undefined;
}).pipe(Atom.keepAlive);

export const configOptionIndexAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make<ConfigOptionIndex | undefined>(undefined).pipe(
    Atom.withLabel(`configOptionIndex:${launchTarget}`),
    Atom.keepAlive,
  ),
);

/**
 * Whether the provider's backend may run. `stopped` blocks start (disabled / stopping); only an explicit
 * transition back to `running` plus a start can spawn it again. Step 6 drives this from `providerEnabled`.
 */
export type BackendDesiredState = 'running' | 'stopped';

export const backendDesiredStateAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make<BackendDesiredState>('running').pipe(Atom.withLabel(`backendDesired:${launchTarget}`), Atom.keepAlive),
);

/**
 * Per-provider enabled preference, mirrored from User settings once bootstrap has loaded them (and seeded first-run
 * defaults). `undefined` until then, so nothing mounts, launches, or appears in a picker before settings are known.
 */
export const providerEnabledMapAtom = Atom.make<Readonly<Record<string, boolean>> | undefined>(undefined).pipe(
  Atom.withLabel('providerEnabledMap'),
  Atom.keepAlive,
);

/** Launch targets in this build (beta flags applied) whose enabled preference is on. */
export const enabledLaunchTargetsAtom = Atom.make(get => {
  const enabled = get(providerEnabledMapAtom);
  return enabled === undefined ? [] : MOUNTED_AGENT_LAUNCH_TARGETS.filter(launchTarget => enabled[launchTarget]);
}).pipe(Atom.keepAlive);

/** Runtime job state per provider (Download / Install / Remove). Install and Remove mean "switching". */
export const providerJobAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make<RuntimeJob>({ _tag: 'Idle' }).pipe(Atom.withLabel(`providerJob:${launchTarget}`), Atom.keepAlive),
);

/** Raised at shared action boundaries (create / activate / handoff / Virtual binding). Disabled buttons are not enough. */
export class ProviderUnavailable extends Schema.TaggedError<ProviderUnavailable>()('ProviderUnavailable', {
  message: Schema.String,
}) {}

type AtomGetter = <A>(atom: Atom.Atom<A>) => A;

/** Fails unless the provider is enabled and not switching runtimes. Phase readiness is checked by each action. */
export const requireLaunchTargetUsable = (get: AtomGetter, launchTarget: AgentLaunchTarget) => {
  const label = agentLaunchTargetLabel(launchTarget);
  if (!get(enabledLaunchTargetsAtom).includes(launchTarget)) {
    return new ProviderUnavailable({ message: `${label} is disabled` });
  }
  const job = get(providerJobAtom(launchTarget));
  if (job._tag === 'Installing' || job._tag === 'Removing') {
    return new ProviderUnavailable({ message: `${label} is switching runtimes` });
  }
  return undefined;
};

export const backendHarnessStateAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make(initialBackendHarnessSnapshot()).pipe(Atom.withLabel(`backendState:${launchTarget}`), Atom.keepAlive),
);

export const unifiedSessionHistoryAtom = Atom.make(get => {
  const entries: UnifiedHistoryEntry[] = [];
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    for (const entry of get(backendHarnessStateAtom(launchTarget)).sessionHistory) {
      entries.push({ ...entry, launchTarget });
    }
  }
  return entries;
}).pipe(Atom.keepAlive);

/** Session History rows the UI shows: archived rows are listed (`archived: 'all'`) but hidden. */
export const visibleSessionHistoryAtom = Atom.make(get =>
  get(unifiedSessionHistoryAtom).filter(entry => !isArchivedEntry(entry)),
).pipe(Atom.keepAlive);

export const findLaunchTargetForSessionId = (
  getSnapshot: (launchTarget: AgentLaunchTarget) => BackendHarnessSnapshot,
  sessionId: string,
): AgentLaunchTarget | undefined => {
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    const snapshot = getSnapshot(launchTarget);
    const entry = snapshot.sessionHistory.find(candidate => candidate.sessionId === sessionId);
    // A session archived elsewhere counts as missing even while loaded.
    if ((entry !== undefined && !isArchivedEntry(entry)) || (entry === undefined && sessionId in snapshot.sessions)) {
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

/** Subagent map of the selected session's provider; undefined when no session is selected. */
export const selectedSubagentsAtom = Atom.make(get => {
  const launchTarget = get(selectedSessionLaunchTargetAtom);
  return launchTarget === undefined
    ? undefined
    : { launchTarget, subagents: get(backendHarnessStateAtom(launchTarget)).subagents };
});

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

/** RPC wire logs for every mounted launch target (unified Developer panel wire tab). */
export const allRpcWireCallsAtom = Atom.make(get =>
  MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
    entries: get(backendHarnessStateAtom(launchTarget)).rpcCalls,
    launchTarget,
  })),
).pipe(Atom.keepAlive);

/** Initialize response per mounted launch target (undefined until that provider has initialized). */
export const allInitializeResultsAtom = Atom.make(get =>
  MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
    initializeResult: get(backendHarnessStateAtom(launchTarget)).initializeResult,
    launchTarget,
  })),
).pipe(Atom.keepAlive);

export const allLaunchTargetPhasesAtom = Atom.make(get =>
  MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
    antigravityAuthUrl: get(backendHarnessStateAtom(launchTarget)).antigravityAuthUrl,
    failure: get(backendHarnessStateAtom(launchTarget)).failure,
    label: agentLaunchTargetLabel(launchTarget),
    launchTarget,
    phase: get(backendHarnessStateAtom(launchTarget)).phase,
  })),
).pipe(Atom.keepAlive);

/** Phase entries for enabled providers only (new-session menu, session history). */
export const enabledLaunchTargetPhasesAtom = Atom.make(get => {
  const enabled = get(enabledLaunchTargetsAtom);
  return get(allLaunchTargetPhasesAtom).filter(entry => enabled.includes(entry.launchTarget));
}).pipe(Atom.keepAlive);

/** Launch targets that are usable with a nonempty (possibly cached) Config index. */
export const usableLaunchTargetsAtom = Atom.make(get =>
  get(enabledLaunchTargetsAtom).filter(
    launchTarget =>
      isUsablePhase(get(backendHarnessStateAtom(launchTarget)).phase) &&
      configOptionIndexIsNonempty(get(configOptionIndexAtom(launchTarget))),
  ),
).pipe(Atom.keepAlive);

/** Why an enabled provider is not ready (`undefined` when ready). Shown beside its disabled picker row. */
export const launchTargetUnavailableReasonsAtom = Atom.make(get => {
  const reasons: Partial<Record<AgentLaunchTarget, string>> = {};
  for (const launchTarget of get(enabledLaunchTargetsAtom)) {
    const snapshot = get(backendHarnessStateAtom(launchTarget));
    if (snapshot.phase === 'error') {
      reasons[launchTarget] = snapshot.failure?.message ?? 'Unavailable';
    } else if (!isUsablePhase(snapshot.phase)) {
      reasons[launchTarget] = 'Starting…';
    } else if (!configOptionIndexIsNonempty(get(configOptionIndexAtom(launchTarget)))) {
      reasons[launchTarget] = snapshot.phase === 'usable' ? 'Loading models…' : 'No configuration available';
    }
  }
  return reasons;
}).pipe(Atom.keepAlive);

/**
 * Picker rows: every enabled provider, even when unavailable (rendered disabled with a reason). Readiness is
 * derived separately in {@link usableLaunchTargetsAtom}; missing configuration must not hide an unavailable row.
 */
export const pickerLaunchTargetsAtom = Atom.make(get => get(enabledLaunchTargetsAtom)).pipe(Atom.keepAlive);

export const selectSession = (get: Atom.FnContext, sessionId: string) => {
  if (get(virtualLifecycleInFlightAtom)) {
    return;
  }
  get.set(selectedAtom, { _tag: 'Session', sessionId });
};

export const clearSelected = (get: Atom.FnContext) => {
  if (get(virtualLifecycleInFlightAtom)) {
    return;
  }
  get.set(selectedAtom, undefined);
};

export const clearSelectedSessionIfMissing = (get: Atom.FnContext) => {
  const selected = get(selectedAtom);
  if (selected?._tag !== 'Session') {
    return;
  }
  if (
    findLaunchTargetForSessionId(launchTarget => get(backendHarnessStateAtom(launchTarget)), selected.sessionId) ===
    undefined
  ) {
    clearSelected(get);
  }
};

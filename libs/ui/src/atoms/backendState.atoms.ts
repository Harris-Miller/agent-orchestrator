/** Core ACP backend / session selection Atom state. */
import { Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import type { BackendHarnessSnapshot, UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import {
  agentLaunchTargetLabel,
  ALL_AGENT_LAUNCH_TARGETS,
  MOUNTED_AGENT_LAUNCH_TARGETS,
} from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { isArchivedEntry } from '../host/airMeta.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configOptionIndexIsNonempty } from '../host/configProbe.ts';
import { harnessUnavailableReason } from '../host/launchTargetAvailability.ts';
import { isSwitchingJob } from '../host/providerView.ts';
import type { RuntimeJob } from '../host/providerView.ts';
import { getSubagent } from '../host/subagent.ts';
import { isLinked } from '../host/subagentLinks.ts';

import { backendHarnessSnapshotAtom } from './harnessSnapshot.ts';
import { rpcWireLogAtom } from './rpcWireLog.ts';
import { spawnedLinksAtom } from './subagentLinks.atoms.ts';
import {
  showArchivedAtom,
  unwrapUserSettings,
  userSettingsDocumentAtom,
} from './userSettings/userSettingsDocument.atoms.ts';

export { backendHarnessSnapshotAtom, showArchivedAtom };

export type Selected = { readonly _tag: 'Session'; readonly sessionId: string } | { readonly _tag: 'Virtual' };

export const selectedAtom = Atom.make<Selected | undefined>(undefined).pipe(Atom.keepAlive);

/** Child session currently shown full-pane (a view of `subagents[childId]`, not a Selected arm). */
export const viewedSubagentAtom = Atom.make<
  { readonly childId: string; readonly launchTarget: AgentLaunchTarget; readonly rootSessionId: string } | undefined
>(undefined).pipe(Atom.keepAlive);

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

/** Config option index of every launch target, for lookups by an arbitrary target (Handoff picker, event handlers). */
export const configOptionIndexByLaunchTargetAtom = Atom.make(get => {
  const indexes: Partial<Record<AgentLaunchTarget, ConfigOptionIndex>> = {};
  for (const launchTarget of ALL_AGENT_LAUNCH_TARGETS) {
    indexes[launchTarget] = get(configOptionIndexAtom(launchTarget));
  }
  return indexes;
}).pipe(Atom.keepAlive);

/**
 * Whether the provider's backend may run. `stopped` blocks start (disabled / stopping); only an explicit
 * transition back to `running` plus a start can spawn it again. Step 6 drives this from `providerEnabled`.
 */
export type BackendDesiredState = 'running' | 'stopped';

export const backendDesiredStateAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make<BackendDesiredState>('running').pipe(Atom.withLabel(`backendDesired:${launchTarget}`), Atom.keepAlive),
);

/**
 * Provider bootstrap has seeded first-run defaults and cleaned up runtimes (`ProviderBootstrapGate`). Until then no
 * launch target is enabled, so nothing mounts, launches, or appears in a picker.
 */
export const providerBootstrapDoneAtom = Atom.make(false).pipe(Atom.withLabel('providerBootstrapDone'), Atom.keepAlive);

/** Launch targets in this build (beta flags applied) whose User settings enabled preference is on. */
export const enabledLaunchTargetsAtom = Atom.make(get => {
  if (!get(providerBootstrapDoneAtom)) {
    return [];
  }
  const enabled = unwrapUserSettings(get(userSettingsDocumentAtom)).providerEnabled ?? {};
  return MOUNTED_AGENT_LAUNCH_TARGETS.filter(launchTarget => enabled[launchTarget] === true);
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
  if (isSwitchingJob(get(providerJobAtom(launchTarget)))) {
    return new ProviderUnavailable({ message: `${label} is switching runtimes` });
  }
  return undefined;
};

/** Every launch target's Session History rows, except Spawned subagent sessions while their link is live (ADR 0011). */
export const unifiedSessionHistoryAtom = Atom.make(get => {
  const links = get(spawnedLinksAtom);
  const entries: UnifiedHistoryEntry[] = [];
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    for (const entry of get(backendHarnessSnapshotAtom(launchTarget)).sessionHistory) {
      if (!isLinked(links, launchTarget, entry.sessionId)) {
        entries.push({ ...entry, launchTarget });
      }
    }
  }
  return entries;
}).pipe(Atom.keepAlive);

/** Session History rows the UI shows: every row is listed (`archived: 'all'`); archived ones only with Show archived. */
export const visibleSessionHistoryAtom = Atom.make(get => {
  const history = get(unifiedSessionHistoryAtom);
  return get(showArchivedAtom) ? history : history.filter(entry => !isArchivedEntry(entry));
}).pipe(Atom.keepAlive);

export const findLaunchTargetForSessionId = (
  getSnapshot: (launchTarget: AgentLaunchTarget) => BackendHarnessSnapshot,
  sessionId: string,
  showArchived: boolean,
): AgentLaunchTarget | undefined => {
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    const snapshot = getSnapshot(launchTarget);
    const entry = snapshot.sessionHistory.find(candidate => candidate.sessionId === sessionId);
    // While Show archived is off, an archived row counts as missing even while loaded.
    const visible = entry !== undefined && (showArchived || !isArchivedEntry(entry));
    if (visible || (entry === undefined && sessionId in snapshot.sessions)) {
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
  return findLaunchTargetForSessionId(
    launchTarget => get(backendHarnessSnapshotAtom(launchTarget)),
    sessionId,
    get(showArchivedAtom),
  );
}).pipe(Atom.keepAlive);

/** Subagent map of the selected session's provider; undefined when no session is selected. */
export const selectedSubagentsAtom = Atom.make(get => {
  const launchTarget = get(selectedSessionLaunchTargetAtom);
  return launchTarget === undefined
    ? undefined
    : { launchTarget, subagents: get(backendHarnessSnapshotAtom(launchTarget)).subagents };
});

export const selectedSessionAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  const launchTarget = get(selectedSessionLaunchTargetAtom);
  if (sessionId === undefined || launchTarget === undefined) {
    return undefined;
  }
  return get(backendHarnessSnapshotAtom(launchTarget)).sessions[sessionId];
}).pipe(Atom.keepAlive);

export const selectedBackendHarnessSnapshotAtom = Atom.make(get => {
  const launchTarget = get(selectedSessionLaunchTargetAtom);
  if (launchTarget === undefined) {
    return undefined;
  }
  return get(backendHarnessSnapshotAtom(launchTarget));
}).pipe(Atom.keepAlive);

/**
 * The Subagent view on screen, if any: the viewed child belongs to the Selected session and still exists in its
 * snapshot. Otherwise the Selected session's own transcript shows (glossary: Subagent view).
 */
export const subagentViewAtom = Atom.make(get => {
  const viewed = get(viewedSubagentAtom);
  if (viewed === undefined || viewed.rootSessionId !== get(selectedSessionIdAtom)) {
    return undefined;
  }
  const subagents = get(selectedBackendHarnessSnapshotAtom)?.subagents;
  return subagents === undefined || getSubagent(subagents, viewed.childId) === undefined ? undefined : viewed;
});

/** RPC wire logs for every mounted launch target (unified Developer panel wire tab). */
export const allRpcWireCallsAtom = Atom.make(get =>
  MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
    entries: get(rpcWireLogAtom(launchTarget)),
    launchTarget,
  })),
).pipe(Atom.keepAlive);

/** Initialize response per mounted launch target (undefined until that provider has initialized). */
export const allInitializeResultsAtom = Atom.make(get =>
  MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
    initializeResult: get(backendHarnessSnapshotAtom(launchTarget)).initializeResult,
    launchTarget,
  })),
).pipe(Atom.keepAlive);

export const allLaunchTargetPhasesAtom = Atom.make(get =>
  MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
    antigravityAuthUrl: get(backendHarnessSnapshotAtom(launchTarget)).antigravityAuthUrl,
    failure: get(backendHarnessSnapshotAtom(launchTarget)).failure,
    label: agentLaunchTargetLabel(launchTarget),
    launchTarget,
    phase: get(backendHarnessSnapshotAtom(launchTarget)).phase,
  })),
).pipe(Atom.keepAlive);

/** Phase entries for enabled providers only (new-session menu, session history). */
export const enabledLaunchTargetPhasesAtom = Atom.make(get => {
  const enabled = get(enabledLaunchTargetsAtom);
  return get(allLaunchTargetPhasesAtom).filter(entry => enabled.includes(entry.launchTarget));
}).pipe(Atom.keepAlive);

/**
 * What the backend harness says about each enabled launch target: usable (usable phase and a nonempty, possibly cached,
 * Config option index) or the reason it is not. Provider reasons are merged in by `launchTargetAvailabilityAtom`.
 */
export const harnessAvailabilityAtom = Atom.make(get => {
  const usable: AgentLaunchTarget[] = [];
  const reasons: Partial<Record<AgentLaunchTarget, string>> = {};
  for (const launchTarget of get(enabledLaunchTargetsAtom)) {
    const { failure, phase } = get(backendHarnessSnapshotAtom(launchTarget));
    const reason = harnessUnavailableReason({
      failure,
      hasConfigIndex: configOptionIndexIsNonempty(get(configOptionIndexAtom(launchTarget))),
      phase,
    });
    if (reason === undefined) {
      usable.push(launchTarget);
    } else {
      reasons[launchTarget] = reason;
    }
  }
  return { reasons, usable };
}).pipe(Atom.keepAlive);

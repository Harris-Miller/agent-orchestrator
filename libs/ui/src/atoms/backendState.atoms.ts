/** Core ACP backend / session selection Atom state. */
import { Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import type { BackendHarnessSnapshot, SessionConfiguration, UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import {
  agentLaunchTargetLabel,
  ALL_AGENT_LAUNCH_TARGETS,
  MOUNTED_AGENT_LAUNCH_TARGETS,
} from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { configurationFromValues } from '../host/configOptionIndexUi.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configOptionIndexIsNonempty } from '../host/configProbe.ts';
import { harnessAvailabilityEqual, harnessUnavailableReason } from '../host/launchTargetAvailability.ts';
import type { HarnessAvailability } from '../host/launchTargetAvailability.ts';
import { isSwitchingJob } from '../host/providerView.ts';
import type { RuntimeJob } from '../host/providerView.ts';
import { getSubagent, hasBackgroundActivity, rootAncestorId, subagentRollUp } from '../host/subagent.ts';

import { backendHarnessSnapshotAtom } from './harnessSnapshot.ts';
import { rpcWireLogAtom } from './rpcWireLog.ts';
import { spawnedChildrenSnapshotAtom, wasSpawnedChildIn } from './spawnedSubagent/links.ts';
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
  return MOUNTED_AGENT_LAUNCH_TARGETS.filter(launchTarget => enabled[launchTarget]);
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

/** Every launch target's Session History rows, except Spawned subagent sessions, which are never listed while this app run knows them, live or after their link ends (ADR 0011). Not durable across a restart. */
export const unifiedSessionHistoryAtom = Atom.make(get => {
  const children = get(spawnedChildrenSnapshotAtom);
  const entries: UnifiedHistoryEntry[] = [];
  for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
    for (const entry of get(backendHarnessSnapshotAtom(launchTarget)).sessionHistory) {
      if (!wasSpawnedChildIn(children, { launchTarget, sessionId: entry.sessionId })) {
        entries.push({ ...entry, launchTarget });
      }
    }
  }
  return entries;
}).pipe(Atom.keepAlive);

/** Launch targets whose agent can archive/unarchive sessions. */
export const archiveCapableLaunchTargetsAtom = Atom.make(
  get =>
    new Set(
      MOUNTED_AGENT_LAUNCH_TARGETS.filter(
        launchTarget => get(backendHarnessSnapshotAtom(launchTarget)).agentCapabilities.sessionArchive,
      ),
    ),
).pipe(Atom.keepAlive);

/** Session History rows the UI shows: every row is listed (`archived: 'all'`); archived ones only with Show archived. */
export const visibleSessionHistoryAtom = Atom.make(get => {
  const history = get(unifiedSessionHistoryAtom);
  return get(showArchivedAtom) ? history : history.filter(entry => entry.archived !== true);
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
    const visible = entry !== undefined && (showArchived || entry.archived !== true);
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

/** Narrows the selected Backend harness snapshot to its phase (primitive, so subscribers skip unrelated updates). */
export const selectedBackendHarnessPhaseAtom = Atom.make(get => get(selectedBackendHarnessSnapshotAtom)?.phase).pipe(
  Atom.keepAlive,
);

/** Narrows the selected Backend harness snapshot to its failure (reference-stable until it changes). */
export const selectedBackendHarnessFailureAtom = Atom.make(
  get => get(selectedBackendHarnessSnapshotAtom)?.failure,
).pipe(Atom.keepAlive);

/** Narrows the selected Backend harness snapshot to its Antigravity auth URL. */
export const selectedBackendHarnessAntigravityAuthUrlAtom = Atom.make(
  get => get(selectedBackendHarnessSnapshotAtom)?.antigravityAuthUrl,
).pipe(Atom.keepAlive);

/** Narrows the selected Backend harness snapshot to whether its agent can fork sessions. */
export const selectedBackendHarnessCanForkAtom = Atom.make(
  get => get(selectedBackendHarnessSnapshotAtom)?.agentCapabilities.sessionFork === true,
).pipe(Atom.keepAlive);

/** Narrows the selected Backend harness snapshot to whether its agent supports steering a running turn. */
export const selectedBackendHarnessSteeringSupportedAtom = Atom.make(
  get => get(selectedBackendHarnessSnapshotAtom)?.agentCapabilities.steeringSupported ?? false,
).pipe(Atom.keepAlive);

/** Narrows the selected Backend harness snapshot to whether the selected session has background Subagent work (see `hasBackgroundActivity`). */
export const selectedBackendHarnessBackgroundActiveAtom = Atom.make(get => {
  const snapshot = get(selectedBackendHarnessSnapshotAtom);
  const sessionId = get(selectedSessionIdAtom);
  return snapshot !== undefined && sessionId !== undefined && hasBackgroundActivity(snapshot, sessionId);
}).pipe(Atom.keepAlive);

/** Narrows the selected Backend harness snapshot to its Subagent record. */
const selectedSubagentsRecordAtom = Atom.make(get => get(selectedBackendHarnessSnapshotAtom)?.subagents);

/**
 * Narrows the selected Backend harness snapshot to one Subagent child; a row re-renders only when its own child changes.
 * Not `keepAlive`: entries are keyed by child id and are collected once no row subscribes.
 */
export const selectedSubagentAtom = Atom.family((childId: string) =>
  Atom.make(get => {
    const subagents = get(selectedSubagentsRecordAtom);
    return subagents === undefined ? undefined : getSubagent(subagents, childId);
  }),
);

/**
 * Narrows to what a child's row shows for its subtree (see `subagentRollUp`). Compared by value, so a row re-renders
 * only when it changes. Not `keepAlive`: entries are keyed by child id and are collected once nothing subscribes.
 */
export const selectedSubagentRollUpAtom = Atom.family((childId: string) =>
  Atom.make(get => {
    const subagents = get(selectedSubagentsRecordAtom);
    return subagents === undefined ? { needsInput: false, running: 0 } : subagentRollUp(subagents, childId);
  }).pipe(
    Atom.withEquality<{ readonly needsInput: boolean; readonly running: number }>(
      (a, b) => a.needsInput === b.needsInput && a.running === b.running,
    ),
  ),
);

/**
 * Narrows to a child's display name (undefined when the id is undefined, the child is absent, or it is unnamed).
 * Not `keepAlive`: entries are keyed by child id and are collected once nothing subscribes.
 */
export const selectedSubagentNameAtom = Atom.family((childId: string | undefined) =>
  Atom.make(get => (childId === undefined ? undefined : get(selectedSubagentAtom(childId))?.name)),
);

/**
 * Narrows to a Spawned subagent's Config options, read from its own launch target snapshot (ADR 0011); undefined for
 * a Native child or an absent one. Returns the reference-stable `configuration` array, so a row re-renders only when
 * that child's Config changes. Not `keepAlive`: entries are keyed by child id and are collected once nothing subscribes.
 */
export const selectedSubagentConfigurationAtom = Atom.family((childId: string) =>
  Atom.make((get): SessionConfiguration | undefined => {
    const child = get(selectedSubagentAtom(childId));
    if (child?.kind !== 'spawned') return undefined;
    const live = get(backendHarnessSnapshotAtom(child.launchTarget)).sessions[child.sessionId]?.configuration;
    // A Restored subagent has no session: its recorded values over the launch target's Config option index.
    return (
      live ??
      (child.restored === undefined
        ? undefined
        : configurationFromValues(get(configOptionIndexAtom(child.launchTarget)), child.restored.config))
    );
  }),
);

/**
 * Narrows to the root ancestor session id of a child in the selected Backend harness snapshot.
 * Not `keepAlive`: entries are keyed by child id and are collected once nothing subscribes.
 */
export const selectedSubagentRootIdAtom = Atom.family((childId: string) =>
  Atom.make(get => {
    const subagents = get(selectedSubagentsRecordAtom);
    return subagents === undefined ? undefined : rootAncestorId(subagents, childId);
  }),
);

/**
 * The Subagent view on screen, if any: the viewed child belongs to the Selected session and still exists in its
 * snapshot. Otherwise the Selected session's own transcript shows (glossary: Subagent view).
 */
export const subagentViewAtom = Atom.make(get => {
  const viewed = get(viewedSubagentAtom);
  if (viewed === undefined || viewed.rootSessionId !== get(selectedSessionIdAtom)) {
    return undefined;
  }
  const subagents = get(selectedSubagentsRecordAtom);
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
export const harnessAvailabilityAtom = Atom.make((get): HarnessAvailability => {
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
}).pipe(
  // Recomputes on any launch target snapshot write; keep the value reference while its contents are unchanged.
  Atom.withEquality(harnessAvailabilityEqual),
  Atom.keepAlive,
);

/**
 * Per (launch target, Project) `session/list` state and the shared fold for one list: pages merge into Session History
 * by `sessionId` as they arrive; a complete list does the cwd-scoped replace and the pin sweep; a failed one keeps rows.
 */
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import { isUsablePhase, normalizeSessionHistory } from '../host/acpSessionBootstrap.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { applySessionListPage, dropUnlistedRows } from '../host/harnessStateTransitions.ts';
import { pinsToUnpinAfterList } from '../host/pinnedSessions.ts';
import { runSessionLists } from '../host/sessionListRun.ts';
import type { SessionListRun } from '../host/sessionListRun.ts';
import { listSessionsPayload } from '../host/sessionListScope.ts';
import { listSessions } from '../host/sessionRpc.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { pinnedSessionsAtom, removePins } from './pinnedSessions.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

/** Completeness of one (launch target, Project) list. */
export type SessionListState = 'complete' | 'incomplete' | 'loading';

export const listKey = (launchTarget: AgentLaunchTarget, cwd: string): string => `${launchTarget}\n${cwd}`;

export const sessionListStatesAtom = Atom.make<ReadonlyMap<string, SessionListState>>(new Map()).pipe(
  Atom.withLabel('sessionListStates'),
  Atom.keepAlive,
);

const setListState = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  cwd: string,
  state: SessionListState,
): void => {
  registry.update(sessionListStatesAtom, current => new Map(current).set(listKey(launchTarget, cwd), state));
};

/** Drops every list state of a Project (Stop tracking). */
export const clearListStatesOfCwd = (registry: AtomRegistry.AtomRegistry, cwd: string): void => {
  registry.update(sessionListStatesAtom, current => {
    const next = new Map(current);
    for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) next.delete(listKey(launchTarget, cwd));
    return next;
  });
};

export type ProjectListStatus = {
  readonly state: SessionListState;
  /** Launch targets whose list for the Project is incomplete. */
  readonly incompleteLaunchTargets: readonly AgentLaunchTarget[];
};

/**
 * A Project's aggregate completeness: loading while any list loads or a launch target has none yet, else incomplete if
 * any is. `incompleteLaunchTargets` is reported even while other lists load.
 */
export const projectListStatusAtom = Atom.family((cwd: string) =>
  Atom.make((get): ProjectListStatus => {
    const states = get(sessionListStatesAtom);
    const entries = MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
      launchTarget,
      state: states.get(listKey(launchTarget, cwd)),
    }));
    const incompleteLaunchTargets = entries.filter(entry => entry.state === 'incomplete').map(e => e.launchTarget);
    // A target with no list yet is still pending (loading) unless it already failed to start.
    const pending = entries.some(
      entry =>
        entry.state === 'loading' ||
        (entry.state === undefined && get(backendHarnessSnapshotAtom(entry.launchTarget)).phase !== 'error'),
    );
    if (pending) return { incompleteLaunchTargets, state: 'loading' };
    return { incompleteLaunchTargets, state: incompleteLaunchTargets.length > 0 ? 'incomplete' : 'complete' };
  }).pipe(Atom.keepAlive),
);

/** Runs a Host-service Effect off the caller's fiber (the pin sweep needs `HostServices`; `SessionListRun` stays service-free). */
export type RunFork = (effect: Effect.Effect<void, never, HostServices>) => void;

/** Begins one (launch target, cwd) list: marks it loading and returns the fold for its pages and outcome. */
export const beginSessionList = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  cwd: string,
  runFork: RunFork,
): SessionListRun => {
  setListState(registry, launchTarget, cwd, 'loading');
  const idsAtStart = new Set(
    registry
      .get(backendHarnessSnapshotAtom(launchTarget))
      .sessionHistory.filter(entry => entry.cwd === cwd)
      .map(entry => entry.sessionId),
  );
  // Read before the request so pins made while it is in flight (session/new races) are never swept.
  const pinsBefore = registry.get(pinnedSessionsAtom(launchTarget));
  const listedIds = new Set<string>();
  // Stop tracking clears the list state; a run that outlives it must not re-merge rows or recreate the state.
  const cancelled = () => registry.get(sessionListStatesAtom).get(listKey(launchTarget, cwd)) === undefined;
  return {
    complete: () =>
      Effect.sync(() => {
        if (cancelled()) return;
        updateHarnessSnapshot(registry, launchTarget, current => dropUnlistedRows(current, cwd, listedIds, idsAtStart));
        runFork(removePins(registry, launchTarget, pinsToUnpinAfterList(pinsBefore, listedIds, cwd)));
        setListState(registry, launchTarget, cwd, 'complete');
      }),
    fail: () => {
      if (cancelled()) return;
      setListState(registry, launchTarget, cwd, 'incomplete');
    },
    page: page => {
      if (cancelled()) return;
      for (const { sessionId } of normalizeSessionHistory(page)) listedIds.add(sessionId);
      const boundSessionId = registry.get(virtualSessionAtom)?.sessionId;
      updateHarnessSnapshot(registry, launchTarget, current => applySessionListPage(current, page, boundSessionId));
    },
  };
};

/**
 * Lists the given cwds on every usable launch target (bounded concurrency; a list's failure stays in that list).
 * `onlyIncomplete` re-lists only the lists currently incomplete (Retry).
 */
export const listCwdsOnUsableTargets = (
  registry: AtomRegistry.AtomRegistry,
  cwds: readonly string[],
  runFork: RunFork,
  options: { readonly onlyIncomplete?: boolean } = {},
) =>
  Effect.forEach(
    MOUNTED_AGENT_LAUNCH_TARGETS,
    launchTarget => {
      if (!isUsablePhase(registry.get(backendHarnessSnapshotAtom(launchTarget)).phase)) return Effect.void;
      const states = registry.get(sessionListStatesAtom);
      const wanted = cwds.filter(
        cwd => options.onlyIncomplete !== true || states.get(listKey(launchTarget, cwd)) === 'incomplete',
      );
      return runSessionLists(
        wanted.map(cwd => ({ cwd, run: beginSessionList(registry, launchTarget, cwd, runFork) })),
        (cwd, onPage) => listSessions(launchTarget, listSessionsPayload(launchTarget, cwd), onPage),
      );
    },
    { concurrency: 'unbounded', discard: true },
  );

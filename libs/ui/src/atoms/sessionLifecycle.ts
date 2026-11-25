/**
 * Session lifecycle verbs: Activate, Deactivate, Delete, Fork, Archive / Unarchive, Rename, Stop tracking a Project, and
 * reactivating every Active session. Plain `(registry, input) => Effect` functions, so any caller (the AtomFns at the
 * React edge, the Idle session sweep, Workspace folders, Import) composes them with ordinary Effect concurrency: one
 * verb's run never interrupts another's.
 */
import { Duration, Effect, Exit, Redacted, Semaphore } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';
import {
  ACP_FORK_SOURCE_SESSION_ID,
  ACP_FORKED_SESSION_ID,
  ACP_SESSION_LOAD_MODE,
  sessionAttributes,
} from '@lib/hub/telemetryKeys';
import { annotateLaunchTargetLogs, annotateSessionLogs } from '../host/sessionTelemetry.ts';

import {
  applySessionInfoTitle,
  defectsFromActivationFailure,
  isSessionActiveOrActivating,
  isUsablePhase,
  normalizeConfigOptions,
  resolveSessionCwd,
} from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { requireAgentCapability } from '../host/agentCapabilities.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { closeOnAgent } from '../host/closeOnAgent.ts';
import { configValuesFromOptions } from '../host/configProbe.ts';
import { unavailableModelReset } from '../host/configOptionIndexUi.ts';
import {
  applyLoadedConfiguration,
  beginActivation,
  dropSession,
  failActivation,
  finishActivation,
  markActivationCwdMissing,
  markSessionInactive,
  replaceSessionHistory,
  setSessionArchived,
} from '../host/harnessStateTransitions.ts';
import { awaitHubSettled } from '../host/hubConnection.ts';
import type { SessionTarget } from '../host/projectSessions.ts';
import { historyEntryFromNew } from '../host/sessionMaterialize.ts';
import {
  archiveSession as archiveOnAgent,
  deleteSession as deleteOnAgent,
  forkSession as forkOnAgent,
  loadSession,
  renameSession as renameOnAgent,
  resumeSession,
  unarchiveSession as unarchiveOnAgent,
} from '../host/sessionRpc.ts';
import { sessionHasLiveWork } from '../host/subagent.ts';
import { sessionsToReactivate } from '../host/sessionsToReactivate.ts';

import {
  backendDesiredStateAtom,
  backendHarnessSnapshotAtom,
  configOptionIndexAtom,
  requireLaunchTargetUsable,
  selectedAtom,
} from './backendState.atoms.ts';
import { cancelPrompt } from './chat.atoms.ts';
import type { BackendRestartFailed } from './harness.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { removePins } from './pinnedSessions.atoms.ts';
import { orphanFromWorkstream } from './workstreams.atoms.ts';
import { projectMembershipAtom, removeProjectEverywhere } from './projects.atoms.ts';
import { reportRequestError } from './reportRequestError.ts';
import { rpcWireLogAtom } from './rpcWireLog.ts';
import { applySessionConfigValues } from './sessionConfigChange.ts';
import { endSpawnedChildren, isChildIn, subagentLinksAtom } from './spawnedSubagent/index.ts';
import { untrackSession } from './trackedSessions.ts';
import { trackSession } from './trackSession.ts';
import { modelPickerPrefsAtom } from './userSettings/userSettingsDocument.atoms.ts';
import {
  awaitVirtualSettled,
  clearSelectedIfMissing,
  discardVirtual,
  ensureVirtual,
  rebindVirtual,
  restoreVirtualAfterProviderRestart,
  select,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

/** Stop then start a Provider and wait until usable again; see `restartBackendAwaitingUsable`. */
export type RestartBackend = (
  launchTarget: AgentLaunchTarget,
  registry: Registry,
) => Effect.Effect<void, BackendRestartFailed>;

/** Logs a verb's failure with its Session; the verb still fails. */
export const logSessionFailure = (label: string, target: SessionTarget) =>
  Effect.tapError((error: unknown) =>
    Effect.logError(`${label} failed`, error).pipe(annotateSessionLogs(target.launchTarget, target.sessionId)),
  );

const sessionSpan = (target: SessionTarget) =>
  Effect.annotateCurrentSpan(sessionAttributes(target.launchTarget, target.sessionId));

const usableHarness = (registry: Registry, launchTarget: AgentLaunchTarget) => {
  const snapshot = registry.get(backendHarnessSnapshotAtom(launchTarget));
  return isUsablePhase(snapshot.phase) ? snapshot : undefined;
};

/** The usable Backend harness snapshot, or `undefined` after warning that `action` was skipped. */
const usableHarnessOrSkip = Effect.fnUntraced(function* (
  registry: Registry,
  launchTarget: AgentLaunchTarget,
  action: string,
) {
  const snapshot = usableHarness(registry, launchTarget);
  if (snapshot === undefined) {
    yield* Effect.logWarning(`${action} skipped; backend not usable`).pipe(annotateLaunchTargetLogs(launchTarget));
  }
  return snapshot;
});

const clearSelectionOf = Effect.fnUntraced(function* (registry: Registry, sessionId: string) {
  const selected = registry.get(selectedAtom);
  if (selected?._tag === 'Session' && selected.sessionId === sessionId) {
    yield* select(registry, undefined);
  }
});

export const updateAndClearSelection = Effect.fnUntraced(function* (
  registry: Registry,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
  update: (snapshot: BackendHarnessSnapshot) => BackendHarnessSnapshot,
) {
  // Re-read: a concurrent Bind or list may have changed the snapshot while the RPC was in flight.
  updateHarnessSnapshot(registry, launchTarget, update);
  yield* clearSelectionOf(registry, sessionId);
});

/** Whether the harness is usable and declares the AIR archive capability: the only case an archive RPC is sent. */
const canCallArchive = (registry: Registry, launchTarget: AgentLaunchTarget): boolean =>
  usableHarness(registry, launchTarget)?.agentCapabilities.sessionArchive === true;

/** Run `one` (which logs its own failure) for each target in order, continuing past failures; then fail with the first. */
const forEachTargetContinuing = Effect.fnUntraced(function* <E, R>(
  targets: readonly SessionTarget[],
  one: (target: SessionTarget) => Effect.Effect<void, E, R>,
) {
  const exits = yield* Effect.forEach(targets, target => Effect.exit(one(target)), { concurrency: 1 });
  const failed = exits.find(Exit.isFailure);
  if (failed !== undefined) {
    return yield* failed;
  }
});

/**
 * Activate: open a Session on its agent (`session/resume` when the Agent capabilities allow it and there is history,
 * else `session/load`), unarchiving it first. Selects it unless `keepSelection`. An already active or activating Session
 * is only Selected.
 */
export const activateSession = Effect.fn('activateSession')(function* (
  registry: Registry,
  arg: SessionTarget & { readonly keepSelection?: true },
) {
  yield* sessionSpan(arg);
  const blocked = requireLaunchTargetUsable(atom => registry.get(atom), arg.launchTarget);
  if (blocked !== undefined) {
    return yield* blocked;
  }
  const snapshot = yield* usableHarnessOrSkip(registry, arg.launchTarget, 'activateSession');
  if (snapshot === undefined) {
    return;
  }

  const existingSession = arg.sessionId in snapshot.sessions ? snapshot.sessions[arg.sessionId] : undefined;
  const historyEntry = snapshot.sessionHistory.find(entry => entry.sessionId === arg.sessionId);
  const cwd = resolveSessionCwd(existingSession?.cwd, historyEntry?.cwd);
  if (historyEntry?.archived === true) {
    // Unarchive first; the agent-side call is best-effort, so a failure never blocks opening the session.
    updateHarnessSnapshot(registry, arg.launchTarget, current => setSessionArchived(current, arg.sessionId, false));
    if (snapshot.agentCapabilities.sessionArchive) {
      yield* unarchiveOnAgent(arg.launchTarget, arg.sessionId).pipe(
        Effect.catchCause(cause =>
          Effect.logWarning('session/unarchive failed', cause).pipe(annotateLaunchTargetLogs(arg.launchTarget)),
        ),
      );
    }
  }

  // A reload re-opens a session in place: whatever is Selected (even the Virtual draft) stays.
  if (arg.keepSelection !== true) {
    yield* select(registry, { _tag: 'Session', sessionId: arg.sessionId });
  }

  // Fresh session/new already materializes an active local snapshot. Re-entering via
  // session/load (empty transcript ⇒ load) breaks Codex ("no rollout found for thread id").
  if (existingSession !== undefined && isSessionActiveOrActivating(existingSession.status)) {
    yield* Effect.logInfo('activateSession skipped; already active/activating').pipe(
      annotateSessionLogs(arg.launchTarget, arg.sessionId),
    );
    return;
  }

  if (cwd === undefined) {
    yield* Effect.logError('Session activation failed; session cwd missing').pipe(
      annotateSessionLogs(arg.launchTarget, arg.sessionId),
    );
    updateHarnessSnapshot(registry, arg.launchTarget, current => markActivationCwdMissing(current, arg.sessionId));
    return;
  }

  // ADR 0004 heuristic, only when the Agent capabilities permit resume (never for Cursor, ADR 0013).
  const hasHistory = existingSession !== undefined && existingSession.transcript.items.length > 0;
  const useResume = snapshot.agentCapabilities.sessionResume && hasHistory;
  yield* Effect.logInfo('Activating session').pipe(
    Effect.annotateLogs({ cwd: Redacted.make(cwd), [ACP_SESSION_LOAD_MODE]: useResume ? 'resume' : 'load' }),
    annotateSessionLogs(arg.launchTarget, arg.sessionId),
  );

  const previousTranscript = existingSession?.transcript;
  updateHarnessSnapshot(registry, arg.launchTarget, current =>
    beginActivation(current, arg.sessionId, cwd, useResume ? 'resume' : 'load'),
  );

  const exit = yield* Effect.exit(
    useResume ? resumeSession(arg.launchTarget, arg.sessionId, cwd) : loadSession(arg.launchTarget, arg.sessionId, cwd),
  );

  if (Exit.isFailure(exit)) {
    yield* Effect.logError('Session activation failed').pipe(annotateSessionLogs(arg.launchTarget, arg.sessionId));
    // The RPC wire log's latest failure data, else the cause's defects.
    const defects = defectsFromActivationFailure(registry.get(rpcWireLogAtom(arg.launchTarget)), exit.cause);
    updateHarnessSnapshot(registry, arg.launchTarget, current =>
      failActivation(current, arg.sessionId, defects, previousTranscript),
    );
    return;
  }

  // The loaded Session configuration first (still `activating`), then the reset folds into the latest Session.
  const loaded = normalizeConfigOptions(exit.value);
  updateHarnessSnapshot(registry, arg.launchTarget, current =>
    applyLoadedConfiguration(current, arg.sessionId, loaded),
  );
  const reset = yield* applySessionConfigValues(
    registry,
    { launchTarget: arg.launchTarget, sessionId: arg.sessionId },
    unavailableModelReset(
      registry.get(configOptionIndexAtom(arg.launchTarget)),
      configValuesFromOptions(loaded),
      registry.get(modelPickerPrefsAtom(arg.launchTarget)),
    ),
  );
  if (reset.stoppedEarly) {
    yield* Effect.logWarning('Session config reset failed during activation').pipe(
      annotateSessionLogs(arg.launchTarget, arg.sessionId),
    );
  }
  updateHarnessSnapshot(registry, arg.launchTarget, current => finishActivation(current, arg.sessionId));
  yield* Effect.logInfo('Session activated').pipe(annotateSessionLogs(arg.launchTarget, arg.sessionId));
});

/**
 * Deactivate (desktop glossary): Prompt turn cancel when the Session has live work (a failed cancel never blocks the
 * close), end the Spawned subagent children it started, `session/close` on the agent (fail-closed when advertised: the
 * Session then stays active and the error is raised; best-effort otherwise), mark it `inactive`, and clear Selected when
 * it was this Session. Skipped while the backend is not usable.
 */
export const deactivateSession = Effect.fn('deactivateSession')(
  function* (registry: Registry, arg: SessionTarget) {
    yield* sessionSpan(arg);
    const snapshot = yield* usableHarnessOrSkip(registry, arg.launchTarget, 'deactivateSession');
    if (snapshot === undefined) {
      return;
    }

    const closing = snapshot.sessions[arg.sessionId];
    if (closing !== undefined && sessionHasLiveWork(snapshot, closing)) {
      yield* cancelPrompt(registry, arg).pipe(Effect.ignore);
    }

    // Children the Harness started for this session end with it (a Prompt turn cancel alone spares background ones).
    yield* endSpawnedChildren(registry, arg);

    yield* Effect.logInfo('Deactivating session').pipe(annotateSessionLogs(arg.launchTarget, arg.sessionId));
    yield* closeOnAgent(snapshot.agentCapabilities, arg.launchTarget, arg.sessionId);

    updateHarnessSnapshot(registry, arg.launchTarget, current => markSessionInactive(current, arg.sessionId));
    yield* clearSelectionOf(registry, arg.sessionId);
  },
  (effect, _registry, arg) => effect.pipe(logSessionFailure('deactivateSession', arg)),
);

/**
 * Delete: always untracks (the row, its Tracked session record and its pin go whatever the agent-side calls do), ends
 * its Spawned subagent children, closes an open Session on the agent best-effort, then `session/delete` where
 * advertised (its failure is raised after the untrack). Without a usable backend it only untracks.
 */
export const deleteSession = Effect.fn('deleteSession')(
  function* (registry: Registry, arg: SessionTarget) {
    yield* sessionSpan(arg);
    const snapshot = registry.get(backendHarnessSnapshotAtom(arg.launchTarget));
    const usable = isUsablePhase(snapshot.phase);

    const session = arg.sessionId in snapshot.sessions ? snapshot.sessions[arg.sessionId] : undefined;
    const needsClose = session !== undefined && session.status !== 'inactive';
    const cwd = resolveSessionCwd(
      session?.cwd,
      snapshot.sessionHistory.find(entry => entry.sessionId === arg.sessionId)?.cwd,
    );

    yield* endSpawnedChildren(registry, arg);

    yield* updateAndClearSelection(registry, arg.launchTarget, arg.sessionId, current =>
      dropSession(current, arg.sessionId),
    );
    if (cwd !== undefined) {
      yield* untrackSession(arg.launchTarget, cwd, arg.sessionId);
    }
    yield* removePins(registry, arg.launchTarget, [arg.sessionId]);
    yield* orphanFromWorkstream(registry, arg).pipe(
      Effect.catchCause(cause => Effect.logWarning('orphan deleted session failed', cause)),
    );

    if (!usable) {
      yield* Effect.logWarning('deleteSession untracked only; backend not usable').pipe(
        annotateLaunchTargetLogs(arg.launchTarget),
      );
      return;
    }

    // An active session is closed on the agent whether or not it advertises `session/delete`.
    if (needsClose) {
      yield* Effect.logInfo('Closing session before delete').pipe(annotateSessionLogs(arg.launchTarget, arg.sessionId));
      yield* closeOnAgent(snapshot.agentCapabilities, arg.launchTarget, arg.sessionId).pipe(Effect.ignore);
    }
    if (snapshot.agentCapabilities.sessionDelete) {
      yield* Effect.logInfo('Deleting session').pipe(annotateSessionLogs(arg.launchTarget, arg.sessionId));
      yield* deleteOnAgent(arg.launchTarget, arg.sessionId);
    }
  },
  (effect, _registry, arg) => effect.pipe(logSessionFailure('deleteSession', arg)),
);

/**
 * Fork: `session/fork`, then treat the result like a `session/list` row (tracked, not active) and Activate it through
 * the normal path (empty local transcript ⇒ `session/load`) so the agent hydrates / replays — vendors' fork may not leave
 * the new id live the way the unstable spec implies.
 */
export const forkSession = Effect.fn('forkSession')(
  function* (registry: Registry, arg: SessionTarget & { readonly cwd: string }) {
    yield* sessionSpan(arg);
    const snapshot = yield* usableHarnessOrSkip(registry, arg.launchTarget, 'forkSession');
    if (snapshot === undefined) {
      return false;
    }
    yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionFork');

    const result = yield* forkOnAgent(arg.launchTarget, arg.sessionId, arg.cwd).pipe(
      reportRequestError(registry, arg, 'session/fork'),
    );
    if (result === undefined) {
      return false;
    }
    const forkedSessionId = result.sessionId;
    yield* Effect.annotateCurrentSpan(ACP_FORKED_SESSION_ID, forkedSessionId);

    const parentEntry = snapshot.sessionHistory.find(entry => entry.sessionId === arg.sessionId);
    const createdEntry = historyEntryFromNew(result, arg.cwd);
    if (createdEntry === undefined) {
      yield* Effect.logError('forkSession skipped; fork result missing sessionId').pipe(
        annotateLaunchTargetLogs(arg.launchTarget),
      );
      return false;
    }
    const historyEntry =
      parentEntry?.title !== undefined ? { ...createdEntry, title: parentEntry.title } : createdEntry;

    yield* trackSession(registry, arg.launchTarget, historyEntry);
    yield* activateSession(registry, { launchTarget: arg.launchTarget, sessionId: forkedSessionId });
    yield* Effect.logInfo('UI forkSession complete').pipe(
      Effect.annotateLogs({ [ACP_FORK_SOURCE_SESSION_ID]: arg.sessionId }),
      annotateSessionLogs(arg.launchTarget, forkedSessionId),
    );
    return true;
  },
  (effect, _registry, arg) => effect.pipe(logSessionFailure('forkSession', arg)),
);

/**
 * Archive: flips the app-owned archived flag (and drops the row from selection), then `session/archive` where declared:
 * a failed call is raised, but the flag stays flipped. Archiving never un-imports.
 */
export const archiveSession = Effect.fn('archiveSession')(
  function* (registry: Registry, arg: SessionTarget) {
    yield* sessionSpan(arg);
    yield* Effect.logInfo('Archiving session').pipe(annotateSessionLogs(arg.launchTarget, arg.sessionId));
    yield* updateAndClearSelection(registry, arg.launchTarget, arg.sessionId, current =>
      setSessionArchived(current, arg.sessionId, true),
    );
    if (canCallArchive(registry, arg.launchTarget)) {
      yield* archiveOnAgent(arg.launchTarget, arg.sessionId);
    }
  },
  (effect, _registry, arg) => effect.pipe(logSessionFailure('archiveSession', arg)),
);

/** Unarchive: flips the flag back, then `session/unarchive` where declared (a failure is raised; the flag stays). Never opens or selects it. */
export const unarchiveSession = Effect.fn('unarchiveSession')(
  function* (registry: Registry, arg: SessionTarget) {
    yield* sessionSpan(arg);
    yield* Effect.logInfo('Unarchiving session').pipe(annotateSessionLogs(arg.launchTarget, arg.sessionId));
    updateHarnessSnapshot(registry, arg.launchTarget, current => setSessionArchived(current, arg.sessionId, false));
    if (canCallArchive(registry, arg.launchTarget)) {
      yield* unarchiveOnAgent(arg.launchTarget, arg.sessionId);
    }
  },
  (effect, _registry, arg) => effect.pipe(logSessionFailure('unarchiveSession', arg)),
);

/** Archive each target in order, continuing past failures; then fail with the first failure. */
export const archiveSessions = (registry: Registry, targets: readonly SessionTarget[]) =>
  forEachTargetContinuing(targets, target => archiveSession(registry, target));

/** Unarchive each target in order, continuing past failures; then fail with the first failure. */
export const unarchiveSessions = (registry: Registry, targets: readonly SessionTarget[]) =>
  forEachTargetContinuing(targets, target => unarchiveSession(registry, target));

/** Rename: optimistic title patch; on RPC failure restore the previous title only if it is still the optimistic one. */
export const renameSession = Effect.fn('renameSession')(
  function* (registry: Registry, arg: SessionTarget & { readonly title: string }) {
    yield* sessionSpan(arg);
    const snapshot = yield* usableHarnessOrSkip(registry, arg.launchTarget, 'renameSession');
    if (snapshot === undefined) {
      return false;
    }
    yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionRename');

    const entryFor = (current: BackendHarnessSnapshot) =>
      current.sessionHistory.find(item => item.sessionId === arg.sessionId);
    const previousTitle = entryFor(snapshot)?.title;
    const setTitle = (title: string | undefined) => {
      updateHarnessSnapshot(registry, arg.launchTarget, current =>
        replaceSessionHistory(current, applySessionInfoTitle(current.sessionHistory, arg.sessionId, title)),
      );
    };

    setTitle(arg.title);
    yield* renameOnAgent(arg.launchTarget, arg.sessionId, arg.title).pipe(
      Effect.tapError(() =>
        Effect.sync(() => {
          if (entryFor(registry.get(backendHarnessSnapshotAtom(arg.launchTarget)))?.title === arg.title) {
            setTitle(previousTitle);
          }
        }),
      ),
    );
    return true;
  },
  (effect, _registry, arg) => effect.pipe(logSessionFailure('renameSession', arg)),
);

/**
 * Stop tracking a Project: Deactivates each of its Active sessions concurrently (each Deactivate logs its own failure; the
 * first is raised at the end, never blocking the stop), resets Selected to a fresh Virtual draft when it belonged to the Project,
 * then removes the Project with its rows. Never deletes sessions or pins.
 */
export const stopTrackingProject = Effect.fn('stopTrackingProject')(function* (registry: Registry, cwd: string) {
  const { activeSessions, selectedInProject, virtualBoundInProject } = registry.get(projectMembershipAtom(cwd));
  const virtual = registry.get(virtualSessionAtom);
  // The Bound Virtual session is closed by discarding the blob below, not here; see `projectMembership` for the rule.
  const toDeactivate = activeSessions.filter(
    target => !(virtualBoundInProject && target.sessionId === virtual?.sessionId),
  );
  const exits = yield* Effect.forEach(toDeactivate, target => Effect.exit(deactivateSession(registry, target)), {
    concurrency: 'unbounded',
  });
  const selectedBefore = registry.get(selectedAtom);
  if (virtualBoundInProject) {
    yield* discardVirtual(registry);
    // The discard clears Selected unconditionally; an unrelated Selected session must survive it.
    if (!selectedInProject && selectedBefore !== undefined) registry.set(selectedAtom, selectedBefore);
  }
  // Selected belonged to the Project (or was just cleared by the discard): fall back to a Virtual draft, keeping
  // an existing unrelated one.
  if (selectedInProject || (virtualBoundInProject && registry.get(selectedAtom) === undefined)) {
    yield* ensureVirtual(registry, {});
  }
  yield* removeProjectEverywhere(registry, cwd);
  clearSelectedIfMissing(registry);
  const failed = exits.find(Exit.isFailure);
  if (failed !== undefined) {
    return yield* failed;
  }
});

/** Deactivate every session of one launch target, restart its Provider, then Activate them again. */
const reactivateTargetGroup = Effect.fnUntraced(function* (
  registry: Registry,
  restartBackend: RestartBackend,
  launchTarget: AgentLaunchTarget,
  group: readonly SessionTarget[],
) {
  yield* Effect.forEach(group, target => deactivateSession(registry, target).pipe(Effect.ignore), { concurrency: 1 });
  // The restart drops a Bound Virtual draft's target and Config; capture them to restore it after.
  const virtualBefore = registry.get(virtualSessionAtom);
  // Restart rather than only close and resume: a Provider (Codex) may ignore changed MCP servers on a resume after a close.
  const restartError = yield* restartBackend(launchTarget, registry).pipe(
    Effect.as(undefined),
    Effect.catch(error => Effect.succeed(error)),
  );
  if (restartError !== undefined) {
    yield* Effect.logError('reactivateActiveSessions restart failed', restartError).pipe(
      annotateLaunchTargetLogs(launchTarget),
    );
    // The sessions stay inactive: say so in each one's chat (the "Activation failed" banner with Retry).
    const message = `Provider restart failed: ${restartError.reason}`;
    updateHarnessSnapshot(registry, launchTarget, current =>
      group.reduce((next, target) => failActivation(next, target.sessionId, [{ message }], undefined), current),
    );
    return;
  }
  yield* Effect.forEach(
    group,
    target =>
      activateSession(registry, { ...target, keepSelection: true }).pipe(
        logSessionFailure('reactivateActiveSessions activate', target),
        Effect.ignore,
      ),
    { concurrency: 1 },
  );
  if (virtualBefore?.launchTarget === launchTarget) {
    yield* restoreVirtualAfterProviderRestart(registry, virtualBefore);
  }
});

/** Generous: a cold hub start (Node spawn) can outlast a session RPC's own settle window. */
const HUB_SETTLE_TIMEOUT = Duration.minutes(1);
/** One reactivation at a time per registry, so a second change never starts while the first holds a session between steps. */
const reactivateLocks = new WeakMap<Registry, Semaphore.Semaphore>();
const reactivateLockOf = (registry: Registry) => {
  const existing = reactivateLocks.get(registry);
  if (existing !== undefined) return existing;
  const lock = Semaphore.makeUnsafe(1);
  reactivateLocks.set(registry, lock);
  return lock;
};

/**
 * Reactivate every active session (all launch targets) so its `session/load` / `session/resume` re-reads the current
 * Experimental: App Orchestrated Agents state: Deactivate (cancels a running Prompt turn, ends Spawned subagent
 * children, closes on the agent, revokes the credential), then restart the Provider (Codex ignores changed MCP
 * servers on a resume after a close) and Activate again. Waits for the hub to leave `connecting` first. Spawned
 * subagent sessions are skipped (they end with their parent); the Bound Virtual session is rebound instead. One
 * session's failure is logged and never blocks the others; a Provider that fails to restart keeps its sessions inactive
 * and never blocks other Providers; Selected is kept. Only Providers with sessions to reactivate restart, never a
 * stopped one. Each launch target's Deactivate + restart + Activate group is uninterruptible and serialized, so a second
 * change mid-run never leaves a session Deactivated.
 */
export const reactivateActiveSessions = Effect.fn('reactivateActiveSessions')(function* (
  registry: Registry,
  restartBackend: RestartBackend,
) {
  yield* awaitHubSettled(HUB_SETTLE_TIMEOUT);
  // An in-flight Bind / Materialize decides whether the Virtual session counts as Bound below.
  yield* awaitVirtualSettled(registry);
  yield* reactivateLockOf(registry).withPermits(1)(
    Effect.gen(function* () {
      const virtual = registry.get(virtualSessionAtom);
      const links = registry.get(subagentLinksAtom);
      // A Provider the user stopped is never started by this; its sessions are already inactive.
      const targets = sessionsToReactivate(
        MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
          launchTarget,
          snapshot: registry.get(backendHarnessSnapshotAtom(launchTarget)),
        })),
        target =>
          registry.get(backendDesiredStateAtom(target.launchTarget)) === 'stopped' ||
          isChildIn(links, target) ||
          (virtual?.launchTarget === target.launchTarget && virtual.sessionId === target.sessionId),
      );
      const selectedBefore = registry.get(selectedAtom);
      // A Spawned subagent child on another target would otherwise die with that target's restart before its
      // parent's group ends its links.
      yield* Effect.forEach(targets, target => endSpawnedChildren(registry, target), { concurrency: 1 });
      yield* Effect.forEach(
        [...Map.groupBy(targets, target => target.launchTarget)],
        ([launchTarget, group]) =>
          reactivateTargetGroup(registry, restartBackend, launchTarget, group).pipe(Effect.uninterruptible),
        { concurrency: 1 },
      );
      // Deactivate clears Selected when it was the reactivated session; put it back unless the user moved meanwhile.
      if (selectedBefore?._tag === 'Session' && registry.get(selectedAtom) === undefined) {
        registry.set(selectedAtom, selectedBefore);
      }
      yield* rebindVirtual(registry);
    }),
  );
});

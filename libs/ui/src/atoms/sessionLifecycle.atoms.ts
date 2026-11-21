/** Session history / lifecycle Atom fns (create, activate, deactivate, delete, refresh). */
import { Effect, Exit, Redacted } from 'effect';
import type { Cause } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import {
  applySessionInfoTitle,
  defectsFromActivationFailure,
  isSessionActiveOrActivating,
  isUsablePhase,
  normalizeConfigOptions,
  resolveSessionCwd,
} from '../host/acpSessionBootstrap.ts';
import { requireAgentCapability } from '../host/agentCapabilities.ts';
import { closeOnAgent } from '../host/closeOnAgent.ts';
import { sessionHasLiveWork } from '../host/subagent.ts';
import { sessionsToReload } from '../host/sessionsToReload.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { isArchivedEntry } from '../host/airMeta.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import {
  applyLoadedConfiguration,
  beginActivation,
  dropSession,
  failActivation,
  failUnarchive,
  finishActivation,
  markActivationCwdMissing,
  markSessionInactive,
  replaceSessionHistory,
  setSessionArchived,
  upsertIntoSnapshot,
} from '../host/harnessStateTransitions.ts';
import { historyEntryFromNew } from '../host/sessionMaterialize.ts';
import { configValuesFromOptions } from '../host/configProbe.ts';
import { resetUnsupportedConfigValues } from '../host/configOptionIndexUi.ts';
import {
  archiveSession,
  deleteSession,
  forkSession,
  loadSession,
  renameSession,
  resumeSession,
  unarchiveSession,
} from '../host/sessionRpc.ts';

import {
  backendHarnessSnapshotAtom,
  configOptionIndexAtom,
  requireLaunchTargetUsable,
  selectedAtom,
} from './backendState.atoms.ts';
import type { createChatAtoms } from './chat.atoms.ts';
import { reportRequestError } from './reportRequestError.ts';
import { endLinksOfParent } from './spawnedSubagent.ts';
import { isChildIn, subagentLinksAtom } from './subagentLinkRegistry.ts';
import { runAtomFn } from './runAtomFn.ts';
import { rpcWireLogAtom } from './rpcWireLog.ts';
import { applySessionConfigValues } from './sessionConfigChange.ts';
import { modelPickerPrefsAtom } from './userSettings/userSettingsDocument.atoms.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { removePins } from './pinnedSessions.atoms.ts';
import type { SessionTarget } from '../host/projectSessions.ts';
import { projectMembershipAtom, removeProjectEverywhere } from './projects.atoms.ts';
import { listCwdsOnUsableTargets } from './sessionLists.atoms.ts';
import type { RunFork } from './sessionLists.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import {
  clearSelectedIfMissing,
  discardVirtual,
  ensureVirtual,
  rebindVirtual,
  select,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

type CancelPromptAtomFn = ReturnType<typeof createChatAtoms>['cancelPromptAtomFn'];

const sessionSpan = (arg: SessionTarget) =>
  Effect.annotateCurrentSpan({
    'acp.agent': arg.launchTarget,
    'acp.sessionId': arg.sessionId,
  });

const usableHarness = (get: Atom.FnContext, launchTarget: AgentLaunchTarget) => {
  const snapshot = get(backendHarnessSnapshotAtom(launchTarget));
  return isUsablePhase(snapshot.phase) ? snapshot : undefined;
};

/** The defects a failed activation records: the RPC wire log's latest failure data, else the cause's defects. */
const activationDefects = <E>(get: Atom.FnContext, launchTarget: AgentLaunchTarget, cause: Cause.Cause<E>) =>
  defectsFromActivationFailure(get(rpcWireLogAtom(launchTarget)), cause);

/** The usable Backend harness snapshot, or `undefined` after warning that `action` was skipped. */
const usableHarnessOrSkip = Effect.fnUntraced(function* (
  get: Atom.FnContext,
  launchTarget: AgentLaunchTarget,
  action: string,
) {
  const snapshot = usableHarness(get, launchTarget);
  if (snapshot === undefined) {
    yield* Effect.logWarning(`${action} skipped; backend not usable`, launchTarget);
  }
  return snapshot;
});

const updateAndClearSelection = Effect.fnUntraced(function* (
  get: Atom.FnContext,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
  update: (snapshot: BackendHarnessSnapshot) => BackendHarnessSnapshot,
) {
  // Re-read: a concurrent Bind or list may have changed the snapshot while the RPC was in flight.
  updateHarnessSnapshot(get.registry, launchTarget, update);
  const selected = get(selectedAtom);
  if (selected?._tag === 'Session' && selected.sessionId === sessionId) {
    yield* select(get.registry, undefined);
  }
});

/** `session/archive` then mark the row archived (and drop it from selection). A no-op when the backend is not usable. */
const archiveOne = Effect.fnUntraced(function* (get: Atom.FnContext, arg: SessionTarget) {
  const snapshot = yield* usableHarnessOrSkip(get, arg.launchTarget, 'archiveSession');
  if (snapshot === undefined) {
    return;
  }
  yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionArchive');

  yield* Effect.logInfo('Archiving session', arg.launchTarget, arg.sessionId);
  yield* archiveSession(arg.launchTarget, arg.sessionId);
  yield* updateAndClearSelection(get, arg.launchTarget, arg.sessionId, current =>
    setSessionArchived(current, arg.sessionId, true),
  );
});

/** `session/unarchive` then mark the row unarchived. Unlike activate, never opens or selects the session. */
const unarchiveOne = Effect.fnUntraced(function* (get: Atom.FnContext, arg: SessionTarget) {
  const snapshot = yield* usableHarnessOrSkip(get, arg.launchTarget, 'unarchiveSession');
  if (snapshot === undefined) {
    return;
  }
  yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionArchive');

  yield* Effect.logInfo('Unarchiving session', arg.launchTarget, arg.sessionId);
  yield* unarchiveSession(arg.launchTarget, arg.sessionId);
  updateHarnessSnapshot(get.registry, arg.launchTarget, current => setSessionArchived(current, arg.sessionId, false));
});

/** Run `one` for each target in order, continuing past failures; then fail with the first failure, if any. */
const forEachTargetContinuing = <E, R>(
  targets: readonly SessionTarget[],
  one: (arg: SessionTarget) => Effect.Effect<void, E, R>,
  failureLabel: string,
) =>
  Effect.gen(function* () {
    const exits = yield* Effect.forEach(
      targets,
      arg =>
        Effect.exit(
          one(arg).pipe(
            Effect.tapError(error => Effect.logError(failureLabel, arg.launchTarget, arg.sessionId, error)),
          ),
        ),
      { concurrency: 1 },
    );
    const failed = exits.find(Exit.isFailure);
    if (failed !== undefined) {
      return yield* failed;
    }
  });

export const createSessionLifecycleAtoms = (runtime: HostRuntimeBag, cancelPromptAtomFn: CancelPromptAtomFn) => {
  const { atomRuntime, hostRunFork } = runtime;
  const forkEffect: RunFork = effect => {
    hostRunFork(effect);
  };

  const clearSelectedAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) => select(get.registry, undefined))
    .pipe(Atom.keepAlive);

  /**
   * Re-lists Session History: one `session/list` per (usable launch target, cwd), where the cwds are every Project (or the
   * VS Code Workspace cwd), or just `arg.cwd` when given. A list's failure is scoped to it (marks it incomplete).
   */
  const refreshAllSessionHistoriesAtomFn = atomRuntime
    .fn(
      Effect.fn('refreshAllSessionHistoriesAtomFn', { root: true })(function* (
        arg: { readonly cwd: string } | undefined,
        get: Atom.FnContext,
      ) {
        const cwds = arg === undefined ? get(listedCwdsAtom) : [arg.cwd];
        yield* listCwdsOnUsableTargets(get.registry, cwds, forkEffect);
        clearSelectedIfMissing(get.registry);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Retry: re-lists only the (launch target, Project) lists that are incomplete. */
  const retryProjectListsAtomFn = atomRuntime
    .fn(
      Effect.fn('retryProjectListsAtomFn', { root: true })(function* (cwd: string, get: Atom.FnContext) {
        yield* listCwdsOnUsableTargets(get.registry, [cwd], forkEffect, { onlyIncomplete: true });
      }),
    )
    .pipe(Atom.keepAlive);

  const activateSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('activateSessionAtomFn', { root: true })(function* (
        arg: { launchTarget: AgentLaunchTarget; sessionId: string; keepSelection?: true },
        get: Atom.FnContext,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.launchTarget,
          'acp.sessionId': arg.sessionId,
        });
        const blocked = requireLaunchTargetUsable(get, arg.launchTarget);
        if (blocked !== undefined) {
          return yield* blocked;
        }
        const snapshot = yield* usableHarnessOrSkip(get, arg.launchTarget, 'activateSession');
        if (snapshot === undefined) {
          return;
        }

        const hasLocalSnapshot = arg.sessionId in snapshot.sessions;
        const existingSession = hasLocalSnapshot ? snapshot.sessions[arg.sessionId] : undefined;
        const historyEntry = snapshot.sessionHistory.find(entry => entry.sessionId === arg.sessionId);
        const cwd = resolveSessionCwd(existingSession?.cwd, historyEntry?.cwd);
        const archived = historyEntry !== undefined && isArchivedEntry(historyEntry);
        if (archived) {
          yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionArchive');
          const unarchiveExit = yield* Effect.exit(unarchiveSession(arg.launchTarget, arg.sessionId));
          if (Exit.isFailure(unarchiveExit)) {
            const defects = activationDefects(get, arg.launchTarget, unarchiveExit.cause);
            updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
              failUnarchive(current, arg.sessionId, defects),
            );
            return yield* Effect.failCause(unarchiveExit.cause);
          }
          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            setSessionArchived(current, arg.sessionId, false),
          );
        }

        // A reload re-opens a session in place: whatever is Selected (even the Virtual draft) stays.
        if (arg.keepSelection !== true) {
          yield* select(get.registry, { _tag: 'Session', sessionId: arg.sessionId });
        }

        // Fresh session/new already materializes an active local snapshot. Re-entering via
        // session/load (empty transcript ⇒ load) breaks Codex ("no rollout found for thread id").
        if (existingSession !== undefined && isSessionActiveOrActivating(existingSession.status)) {
          yield* Effect.logInfo('activateSession skipped; already active/activating', arg.launchTarget, arg.sessionId);
          return;
        }

        if (cwd === undefined) {
          yield* Effect.logError('Session activation failed; session cwd missing', arg.launchTarget, arg.sessionId);
          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            markActivationCwdMissing(current, arg.sessionId),
          );
          return;
        }

        // ADR 0004 heuristic, only when the Agent capabilities permit resume (never for Cursor, ADR 0013).
        const hasHistory = existingSession !== undefined && existingSession.transcript.items.length > 0;
        const useResume = snapshot.agentCapabilities.sessionResume && hasHistory;
        yield* Effect.logInfo('Activating session', arg.launchTarget, arg.sessionId, {
          cwd: Redacted.make(cwd),
          mode: useResume ? 'resume' : 'load',
        });

        const previousTranscript = existingSession?.transcript;
        updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
          beginActivation(current, arg.sessionId, cwd, useResume ? 'resume' : 'load'),
        );

        const exit = yield* Effect.exit(
          useResume
            ? resumeSession(arg.launchTarget, arg.sessionId, cwd)
            : loadSession(arg.launchTarget, arg.sessionId, cwd),
        );

        if (Exit.isFailure(exit)) {
          yield* Effect.logError('Session activation failed', arg.launchTarget, arg.sessionId);
          const defects = activationDefects(get, arg.launchTarget, exit.cause);
          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            failActivation(current, arg.sessionId, defects, previousTranscript),
          );
          return;
        }

        // The loaded Session configuration first (still `activating`), then the reset folds into the latest Session.
        const loaded = normalizeConfigOptions(exit.value);
        updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
          applyLoadedConfiguration(current, arg.sessionId, loaded),
        );
        const reset = yield* applySessionConfigValues(
          get.registry,
          { launchTarget: arg.launchTarget, sessionId: arg.sessionId },
          resetUnsupportedConfigValues(
            get(configOptionIndexAtom(arg.launchTarget)),
            configValuesFromOptions(loaded),
            get(modelPickerPrefsAtom(arg.launchTarget)),
          ),
        );
        if (reset.stoppedEarly) {
          yield* Effect.logWarning('Session config reset failed during activation', arg.launchTarget, arg.sessionId);
        }
        updateHarnessSnapshot(get.registry, arg.launchTarget, current => finishActivation(current, arg.sessionId));
        yield* Effect.logInfo('Session activated', arg.launchTarget, arg.sessionId);
      }),
    )
    .pipe(Atom.keepAlive);

  /**
   * `session/fork` then treat the result like a `session/list` row (history only, not active).
   * Activate via the normal activate path (empty local transcript ⇒ `session/load`) so the
   * agent hydrates/replays — vendors' fork may not leave the new id live the way the unstable
   * spec implies.
   */
  const forkSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('forkSessionAtomFn', { root: true })(
        function* (arg: { cwd: string; launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });
          const snapshot = yield* usableHarnessOrSkip(get, arg.launchTarget, 'forkSession');
          if (snapshot === undefined) {
            return;
          }
          yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionFork');

          const result = yield* forkSession(arg.launchTarget, arg.sessionId, arg.cwd).pipe(
            reportRequestError(get.registry, arg, 'session/fork'),
          );
          if (result === undefined) {
            return;
          }
          const forkedSessionId = result.sessionId;
          yield* Effect.annotateCurrentSpan('acp.forkedSessionId', forkedSessionId);

          const parentEntry = snapshot.sessionHistory.find(entry => entry.sessionId === arg.sessionId);
          const createdEntry = historyEntryFromNew(result, arg.cwd);
          if (createdEntry === undefined) {
            yield* Effect.logError('forkSession skipped; fork result missing sessionId', arg.launchTarget);
            return;
          }
          const historyEntry =
            parentEntry?.title !== undefined ? { ...createdEntry, title: parentEntry.title } : createdEntry;

          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            upsertIntoSnapshot(current, { historyEntry }),
          );

          yield* get.setResult(activateSessionAtomFn, {
            launchTarget: arg.launchTarget,
            sessionId: forkedSessionId,
          });
          yield* Effect.logInfo('UI forkSession complete', arg.launchTarget, {
            forkedSessionId,
            parentSessionId: arg.sessionId,
          });
        },
        (effect, arg) =>
          effect.pipe(
            Effect.tapError(error =>
              Effect.logError('forkSessionAtomFn failed', arg.launchTarget, arg.sessionId, error),
            ),
          ),
      ),
    )
    .pipe(Atom.keepAlive);

  const deactivateSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('deactivateSessionAtomFn', { root: true })(
        function* (arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });
          const snapshot = yield* usableHarnessOrSkip(get, arg.launchTarget, 'deactivateSession');
          if (snapshot === undefined) {
            return;
          }

          // Prompt turn cancel first; a failed cancel must not block the close.
          const closing = snapshot.sessions[arg.sessionId];
          if (closing !== undefined && sessionHasLiveWork(snapshot, closing)) {
            yield* runAtomFn(get.registry, cancelPromptAtomFn, arg).pipe(Effect.ignore);
          }

          // Children the Harness started for this session end with it (a Prompt turn cancel alone spares background ones).
          yield* endLinksOfParent(get.registry, arg);

          yield* Effect.logInfo('Deactivating session', arg.launchTarget, arg.sessionId);
          yield* closeOnAgent(snapshot.agentCapabilities, arg.launchTarget, arg.sessionId);

          updateHarnessSnapshot(get.registry, arg.launchTarget, current => markSessionInactive(current, arg.sessionId));

          const selected = get(selectedAtom);
          if (selected?._tag === 'Session' && selected.sessionId === arg.sessionId) {
            yield* select(get.registry, undefined);
          }
        },
        (effect, arg) =>
          effect.pipe(
            Effect.tapError(error =>
              Effect.logError('deactivateSession failed', arg.launchTarget, arg.sessionId, error),
            ),
          ),
      ),
    )
    .pipe(Atom.keepAlive);

  /**
   * Reload every active session (all launch targets) so its `session/load` / `session/resume` re-reads the current
   * Experimental: App Orchestrated Agents state: Deactivate (cancels a running Prompt turn, ends Spawned subagent
   * children, closes on the agent, revokes the credential), then Activate again. Spawned subagent sessions are skipped
   * (they end with their parent); the Bound Virtual session is rebound instead. One session's failure is logged and
   * never blocks the others; Selected is kept.
   */
  const reloadActiveSessionsAtomFn = atomRuntime
    .fn(
      Effect.fn('reloadActiveSessionsAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        const virtual = get(virtualSessionAtom);
        const links = get(subagentLinksAtom);
        const targets = sessionsToReload(
          MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
            launchTarget,
            snapshot: get(backendHarnessSnapshotAtom(launchTarget)),
          })),
          target =>
            isChildIn(links, target) ||
            (virtual?.launchTarget === target.launchTarget && virtual.sessionId === target.sessionId),
        );
        const selectedBefore = get(selectedAtom);
        yield* Effect.forEach(
          targets,
          target =>
            runAtomFn(get.registry, deactivateSessionAtomFn, target).pipe(
              Effect.andThen(runAtomFn(get.registry, activateSessionAtomFn, { ...target, keepSelection: true })),
              Effect.tapError(error =>
                Effect.logError('reloadActiveSessions failed', target.launchTarget, target.sessionId, error),
              ),
              Effect.ignore,
            ),
          { concurrency: 1 },
        );
        // Deactivate clears Selected when it was the reloaded session; put it back unless the user moved meanwhile.
        if (selectedBefore?._tag === 'Session' && get(selectedAtom) === undefined) {
          get.registry.set(selectedAtom, selectedBefore);
        }
        yield* rebindVirtual(get.registry);
      }),
    )
    .pipe(Atom.keepAlive);

  /**
   * Stop tracking a Project: cancels in-flight prompts and Deactivates each of its active sessions (a close failure is
   * collected and raised at the end, never blocking the stop), resets Selected to a fresh Virtual draft when it belonged
   * to the Project, then removes the Project with its rows and index entries. Never deletes sessions or pins.
   */
  const stopTrackingProjectAtomFn = atomRuntime
    .fn(
      Effect.fn('stopTrackingProjectAtomFn', { root: true })(function* (cwd: string, get: Atom.FnContext) {
        const { activeSessions, selectedInProject, virtualBoundInProject } = get(projectMembershipAtom(cwd));
        const virtual = get(virtualSessionAtom);
        // The Bound Virtual session is closed by discarding the blob below, not here; see `projectMembership` for the rule.
        const toClose = activeSessions.filter(
          target => !(virtualBoundInProject && target.sessionId === virtual?.sessionId),
        );
        const exits = yield* Effect.forEach(
          toClose,
          target => Effect.exit(runAtomFn(get.registry, deactivateSessionAtomFn, target)),
          { concurrency: 'unbounded' },
        );
        const selectedBefore = get(selectedAtom);
        if (virtualBoundInProject) {
          yield* discardVirtual(get.registry);
          // The discard clears Selected unconditionally; an unrelated Selected session must survive it.
          if (!selectedInProject && selectedBefore !== undefined) get.registry.set(selectedAtom, selectedBefore);
        }
        // Selected belonged to the Project (or was just cleared by the discard): fall back to a Virtual draft, keeping
        // an existing unrelated one.
        if (selectedInProject || (virtualBoundInProject && get(selectedAtom) === undefined)) {
          yield* ensureVirtual(get.registry, {});
        }
        yield* removeProjectEverywhere(get.registry, cwd);
        clearSelectedIfMissing(get.registry);
        const failed = exits.find(Exit.isFailure);
        if (failed !== undefined) {
          return yield* failed;
        }
      }),
    )
    .pipe(Atom.keepAlive);

  const archiveSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('archiveSessionAtomFn', { root: true })(
        function* (arg: SessionTarget, get: Atom.FnContext) {
          yield* sessionSpan(arg);
          yield* archiveOne(get, arg);
        },
        (effect, arg) =>
          effect.pipe(
            Effect.tapError(error =>
              Effect.logError('archiveSessionAtomFn failed', arg.launchTarget, arg.sessionId, error),
            ),
          ),
      ),
    )
    .pipe(Atom.keepAlive);

  const unarchiveSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('unarchiveSessionAtomFn', { root: true })(
        function* (arg: SessionTarget, get: Atom.FnContext) {
          yield* sessionSpan(arg);
          yield* unarchiveOne(get, arg);
        },
        (effect, arg) =>
          effect.pipe(
            Effect.tapError(error =>
              Effect.logError('unarchiveSessionAtomFn failed', arg.launchTarget, arg.sessionId, error),
            ),
          ),
      ),
    )
    .pipe(Atom.keepAlive);

  // Bulk: one atom run walking the entries in order (a non-concurrent Atom fn interrupts its previous call, so the
  // single atoms must not be called in a loop).
  const archiveSessionsAtomFn = atomRuntime
    .fn(
      Effect.fn('archiveSessionsAtomFn', { root: true })(function* (
        targets: readonly SessionTarget[],
        get: Atom.FnContext,
      ) {
        yield* forEachTargetContinuing(targets, arg => archiveOne(get, arg), 'archiveSessions entry failed');
      }),
    )
    .pipe(Atom.keepAlive);

  const unarchiveSessionsAtomFn = atomRuntime
    .fn(
      Effect.fn('unarchiveSessionsAtomFn', { root: true })(function* (
        targets: readonly SessionTarget[],
        get: Atom.FnContext,
      ) {
        yield* forEachTargetContinuing(targets, arg => unarchiveOne(get, arg), 'unarchiveSessions entry failed');
      }),
    )
    .pipe(Atom.keepAlive);

  /** Optimistic title patch; on RPC failure restore the previous title only if it is still the optimistic one. */
  const renameSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('renameSessionAtomFn', { root: true })(
        function* (arg: SessionTarget & { readonly title: string }, get: Atom.FnContext) {
          yield* sessionSpan(arg);
          const snapshot = yield* usableHarnessOrSkip(get, arg.launchTarget, 'renameSession');
          if (snapshot === undefined) {
            return;
          }
          yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionRename');

          const entryFor = (current: typeof snapshot) =>
            current.sessionHistory.find(item => item.sessionId === arg.sessionId);
          const previousTitle = entryFor(snapshot)?.title;
          const setTitle = (title: string | undefined) => {
            updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
              replaceSessionHistory(current, applySessionInfoTitle(current.sessionHistory, arg.sessionId, title)),
            );
          };

          setTitle(arg.title);
          yield* renameSession(arg.launchTarget, arg.sessionId, arg.title).pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                const current = entryFor(get(backendHarnessSnapshotAtom(arg.launchTarget)));
                if (current?.title === arg.title) {
                  setTitle(previousTitle);
                }
              }),
            ),
          );
        },
        (effect, arg) =>
          effect.pipe(
            Effect.tapError(error =>
              Effect.logError('renameSessionAtomFn failed', arg.launchTarget, arg.sessionId, error),
            ),
          ),
      ),
    )
    .pipe(Atom.keepAlive);

  const deleteSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('deleteSessionAtomFn', { root: true })(
        function* (arg: SessionTarget, get: Atom.FnContext) {
          yield* sessionSpan(arg);
          const snapshot = yield* usableHarnessOrSkip(get, arg.launchTarget, 'deleteSession');
          if (snapshot === undefined) {
            return;
          }

          const session = arg.sessionId in snapshot.sessions ? snapshot.sessions[arg.sessionId] : undefined;
          const needsClose = session !== undefined && session.status !== 'inactive';

          yield* endLinksOfParent(get.registry, arg);

          // Optimistic: drop locally first; a failed RPC surfaces to the caller and the next list refresh reconciles. Pins stay until the RPC succeeds.
          yield* updateAndClearSelection(get, arg.launchTarget, arg.sessionId, current =>
            dropSession(current, arg.sessionId),
          );

          if (needsClose) {
            yield* Effect.logInfo('Closing session before delete', arg.launchTarget, arg.sessionId);
            yield* closeOnAgent(snapshot.agentCapabilities, arg.launchTarget, arg.sessionId);
          }

          yield* Effect.logInfo('Deleting session', arg.launchTarget, arg.sessionId);
          yield* deleteSession(arg.launchTarget, arg.sessionId);

          // Sweep what a list refresh or a late session/update re-added while the RPC was in flight.
          updateHarnessSnapshot(get.registry, arg.launchTarget, current => dropSession(current, arg.sessionId));
          yield* removePins(get.registry, arg.launchTarget, [arg.sessionId]);
        },
        (effect, arg) =>
          effect.pipe(
            Effect.tapError(error =>
              Effect.logError('deleteSessionAtomFn failed', arg.launchTarget, arg.sessionId, error),
            ),
          ),
      ),
      // Callers do not await the RPC, so a later Delete must not interrupt an earlier one still in flight.
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  return {
    activateSessionAtomFn,
    archiveSessionAtomFn,
    archiveSessionsAtomFn,
    clearSelectedAtomFn,
    deactivateSessionAtomFn,
    deleteSessionAtomFn,
    forkSessionAtomFn,
    refreshAllSessionHistoriesAtomFn,
    reloadActiveSessionsAtomFn,
    retryProjectListsAtomFn,
    renameSessionAtomFn,
    stopTrackingProjectAtomFn,
    unarchiveSessionAtomFn,
    unarchiveSessionsAtomFn,
  };
};

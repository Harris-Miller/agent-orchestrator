/** Session history / lifecycle Atom fns (create, activate, deactivate, delete, refresh). */
import { deleteSessionDir, readSessionUsage } from '@lib/ao-home';
import { Effect, Exit, Option } from 'effect';
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
import type { AgentCapabilities } from '../host/agentCapabilities.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { isArchivedEntry } from '../host/airMeta.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import {
  dropSession,
  historyAfterList,
  markSessionInactive,
  replaceSessionHistory,
  setSessionArchived,
  upsertIntoSnapshot,
} from '../host/harnessStateTransitions.ts';
import { listSessionsPayload } from '../host/sessionListScope.ts';
import { patchSession } from '../host/sessionSnapshot.ts';
import type { SessionListScope } from '../host/sessionListScope.ts';
import { buildActivatedSession, historyEntryFromNew } from '../host/sessionMaterialize.ts';
import { configValuesFromOptions } from '../host/configProbe.ts';
import { resetUnsupportedConfigValues } from '../host/configOptionIndexUi.ts';
import {
  archiveSession,
  closeSession,
  createSession,
  deleteSession,
  forkSession,
  listSessions,
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
import { runAtomFn } from './runAtomFn.ts';
import { applySessionConfigValues } from './sessionConfigChange.ts';
import type { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { pinnedSessionsAtom, reconcilePinsAfterList, removePins } from './pinnedSessions.atoms.ts';
import { resetSubagentsOfRoot } from '../host/subagentRouting.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { clearSelectedIfMissing, select, virtualSessionAtom } from './virtualSession.atoms.ts';

type RefreshSessionFsListingAtomFn = ReturnType<typeof createSessionFsListingAtoms>['refreshSessionFsListingAtomFn'];
type CancelPromptAtomFn = ReturnType<typeof createChatAtoms>['cancelPromptAtomFn'];

type SessionTarget = {
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

const sessionSpan = (arg: SessionTarget) =>
  Effect.annotateCurrentSpan({
    'acp.agent': arg.launchTarget,
    'acp.sessionId': arg.sessionId,
  });

const usableHarness = (get: Atom.FnContext, launchTarget: AgentLaunchTarget) => {
  const snapshot = get(backendHarnessSnapshotAtom(launchTarget));
  return isUsablePhase(snapshot.phase) ? snapshot : undefined;
};

/** Fetch one launch target's session list and fold it into the harness history (minus the Bound id). */
const refreshHistoryFor = Effect.fnUntraced(function* (
  get: Atom.FnContext,
  launchTarget: AgentLaunchTarget,
  listPayload: NonNullable<ReturnType<typeof listSessionsPayload>>,
  scope: SessionListScope,
) {
  const pinsBefore = get(pinnedSessionsAtom(launchTarget));
  const listResult = yield* listSessions(launchTarget, listPayload);
  const boundSessionId = get(virtualSessionAtom)?.sessionId;
  updateHarnessSnapshot(get.registry, launchTarget, current =>
    replaceSessionHistory(current, historyAfterList(current.sessionHistory, listResult, scope, boundSessionId)),
  );
  return { listResult, pinsBefore };
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

/** `session/close`: fail-closed when the Agent advertises close, otherwise best-effort (it may still serve it). Never refused. */
const closeOnAgent = (capabilities: AgentCapabilities, launchTarget: AgentLaunchTarget, sessionId: string) =>
  capabilities.sessionClose
    ? closeSession(launchTarget, sessionId)
    : Effect.asVoid(Effect.exit(closeSession(launchTarget, sessionId)));

export const createSessionLifecycleAtoms = (
  runtime: HostRuntimeBag,
  refreshSessionFsListingAtomFn: RefreshSessionFsListingAtomFn,
  cancelPromptAtomFn: CancelPromptAtomFn,
) => {
  const { atomRuntime } = runtime;

  const selectSessionAtomFn = atomRuntime
    .fn((sessionId: string, get: Atom.FnContext) => select(get.registry, { _tag: 'Session', sessionId }))
    .pipe(Atom.keepAlive);

  const clearSelectedAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) => select(get.registry, undefined))
    .pipe(Atom.keepAlive);

  const refreshSessionHistoryAtomFn = atomRuntime
    .fn(
      Effect.fn('refreshSessionHistoryAtomFn', { root: true })(
        function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': launchTarget,
          });
          const snapshot = usableHarness(get, launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logDebug('refreshSessionHistory skipped; backend not usable', launchTarget);
            return;
          }

          const scope = get(sessionListScopeAtom);
          const listPayload = listSessionsPayload(scope);
          if (listPayload === undefined) {
            return;
          }

          yield* Effect.logDebug('Refreshing session history', launchTarget);
          const { listResult, pinsBefore } = yield* refreshHistoryFor(get, launchTarget, listPayload, scope);
          clearSelectedIfMissing(get.registry);
          yield* reconcilePinsAfterList(get.registry, launchTarget, pinsBefore, listResult, scope);
        },
        (effect, launchTarget) =>
          effect.pipe(Effect.tapError(error => Effect.logError('refreshSessionHistory failed', launchTarget, error))),
      ),
    )
    .pipe(Atom.keepAlive);

  const refreshAllSessionHistoriesAtomFn = atomRuntime
    .fn(
      Effect.fn('refreshAllSessionHistoriesAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        const scope = get(sessionListScopeAtom);
        const listPayload = listSessionsPayload(scope);
        // One provider failing must not interrupt the others.
        const exits = yield* Effect.forEach(
          MOUNTED_AGENT_LAUNCH_TARGETS,
          launchTarget =>
            Effect.exit(
              Effect.gen(function* () {
                const snapshot = usableHarness(get, launchTarget);
                if (snapshot === undefined) {
                  return;
                }
                if (listPayload === undefined) {
                  return;
                }
                const { listResult, pinsBefore } = yield* refreshHistoryFor(get, launchTarget, listPayload, scope);
                yield* reconcilePinsAfterList(get.registry, launchTarget, pinsBefore, listResult, scope);
              }),
            ),
          { concurrency: 'unbounded' },
        );
        clearSelectedIfMissing(get.registry);
        const failed = exits.find(Exit.isFailure);
        if (failed !== undefined) {
          return yield* failed;
        }
      }),
    )
    .pipe(Atom.keepAlive);

  const createSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('createSessionAtomFn', { root: true })(
        function* (arg: { cwd: string; launchTarget: AgentLaunchTarget }, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
          });
          const blocked = requireLaunchTargetUsable(get, arg.launchTarget);
          if (blocked !== undefined) {
            return yield* blocked;
          }
          const snapshot = usableHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('createSession skipped; backend not usable', arg.launchTarget);
            return;
          }

          yield* Effect.logInfo('UI createSession', arg.launchTarget, { cwd: arg.cwd });
          const { cwd, result } = yield* createSession(arg.launchTarget, arg.cwd);
          const { sessionId } = result;
          yield* Effect.annotateCurrentSpan('acp.sessionId', sessionId);

          const session = buildActivatedSession(sessionId, normalizeConfigOptions(result), { cwd });
          const historyEntry = historyEntryFromNew(result, cwd);
          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            upsertIntoSnapshot(current, { historyEntry, session }),
          );
          yield* select(get.registry, { _tag: 'Session', sessionId });
          yield* Effect.logInfo('UI createSession complete', arg.launchTarget, sessionId);
          yield* get.setResult(refreshSessionFsListingAtomFn, { cwd, sessionId });
        },
        (effect, arg) =>
          effect.pipe(Effect.tapError(error => Effect.logError('createSessionAtomFn failed', arg.launchTarget, error))),
      ),
    )
    .pipe(Atom.keepAlive);

  const activateSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('activateSessionAtomFn', { root: true })(function* (
        arg: { launchTarget: AgentLaunchTarget; sessionId: string },
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
        const snapshot = usableHarness(get, arg.launchTarget);
        if (snapshot === undefined) {
          yield* Effect.logWarning('activateSession skipped; backend not usable', arg.launchTarget);
          return;
        }

        const hasLocalSnapshot = arg.sessionId in snapshot.sessions;
        const existingSession = hasLocalSnapshot ? snapshot.sessions[arg.sessionId] : undefined;
        const historyEntry = snapshot.sessionHistory.find(entry => entry.sessionId === arg.sessionId);
        const cwd = resolveSessionCwd(existingSession?.cwd, historyEntry?.cwd);
        const archived = historyEntry !== undefined && isArchivedEntry(historyEntry);
        if (archived) {
          yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionArchive');
        }

        yield* select(get.registry, { _tag: 'Session', sessionId: arg.sessionId });

        // Fresh session/new already materializes an active local snapshot. Re-entering via
        // session/load (empty transcript ⇒ load) breaks Codex ("no rollout found for thread id").
        if (existingSession !== undefined && isSessionActiveOrActivating(existingSession.status)) {
          // Archived elsewhere while loaded here: still unarchive, but send no second load.
          if (archived) {
            yield* unarchiveSession(arg.launchTarget, arg.sessionId);
            updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
              setSessionArchived(current, arg.sessionId, false),
            );
          }
          yield* Effect.logInfo('activateSession skipped; already active/activating', arg.launchTarget, arg.sessionId);
          return;
        }

        if (cwd === undefined) {
          yield* Effect.logError('Session activation failed; session cwd missing', arg.launchTarget, arg.sessionId);
          updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
            ...current,
            sessions: patchSession(current.sessions, arg.sessionId, session => ({
              ...session,
              defects: [{ message: 'Session cwd missing from snapshot and history' }],
              status: 'inactive',
            })),
          }));
          return;
        }

        // ADR 0004 heuristic, only when the Agent capabilities permit resume (never for Cursor, ADR 0013).
        const hasHistory = existingSession !== undefined && existingSession.transcript.items.length > 0;
        const useResume = snapshot.agentCapabilities.sessionResume && hasHistory;
        yield* Effect.logInfo('Activating session', arg.launchTarget, arg.sessionId, {
          cwd,
          mode: useResume ? 'resume' : 'load',
        });

        updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
          resetSubagentsOfRoot(
            {
              ...current,
              sessions: patchSession(current.sessions, arg.sessionId, session => ({
                ...session,
                cwd,
                defects: undefined,
                status: 'activating',
              })),
            },
            arg.sessionId,
          ),
        );

        // Loading never unarchives (Claude, Codex): unarchive first, and send no load if that fails. A load that fails
        // after a successful unarchive leaves the row unarchived.
        const unarchiveFirst = archived
          ? unarchiveSession(arg.launchTarget, arg.sessionId).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
                    setSessionArchived(current, arg.sessionId, false),
                  );
                }),
              ),
            )
          : Effect.void;
        const exit = yield* Effect.exit(
          Effect.andThen(
            unarchiveFirst,
            useResume
              ? resumeSession(arg.launchTarget, arg.sessionId, cwd)
              : loadSession(arg.launchTarget, arg.sessionId, cwd),
          ),
        );

        if (Exit.isFailure(exit)) {
          yield* Effect.logError('Session activation failed', arg.launchTarget, arg.sessionId);
          updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
            ...current,
            sessions: patchSession(current.sessions, arg.sessionId, session => ({
              ...session,
              defects: defectsFromActivationFailure(current.rpcCalls, exit.cause),
              status: 'inactive',
            })),
          }));
          return;
        }

        const persistedUsage = Option.getOrUndefined(yield* readSessionUsage(arg.sessionId));
        // The loaded Session configuration first (still `activating`), then the reset folds into the latest Session.
        const loaded = normalizeConfigOptions(exit.value);
        updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
          ...current,
          sessions: patchSession(current.sessions, arg.sessionId, session => ({ ...session, configuration: loaded })),
        }));
        const reset = yield* applySessionConfigValues(
          get.registry,
          { launchTarget: arg.launchTarget, sessionId: arg.sessionId },
          resetUnsupportedConfigValues(get(configOptionIndexAtom(arg.launchTarget)), configValuesFromOptions(loaded)),
        );
        if (reset.stoppedEarly) {
          yield* Effect.logWarning('Session config reset failed during activation', arg.launchTarget, arg.sessionId);
        }
        updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
          ...current,
          sessions: patchSession(current.sessions, arg.sessionId, session => ({
            ...buildActivatedSession(arg.sessionId, session.configuration ?? [], session),
            usage: persistedUsage,
          })),
        }));
        yield* Effect.logInfo('Session activated', arg.launchTarget, arg.sessionId);
        yield* get.setResult(refreshSessionFsListingAtomFn, { cwd, sessionId: arg.sessionId });
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
          const snapshot = usableHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('forkSession skipped; backend not usable', arg.launchTarget);
            return;
          }
          yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionFork');

          const result = yield* forkSession(arg.launchTarget, arg.sessionId, arg.cwd);
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
          const snapshot = usableHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('deactivateSession skipped; backend not usable', arg.launchTarget);
            return;
          }

          // Prompt turn cancel first; a failed cancel must not block the close.
          if (snapshot.sessions[arg.sessionId]?.pendingClientRequest === 'prompt') {
            yield* runAtomFn(get.registry, cancelPromptAtomFn, arg).pipe(Effect.ignore);
          }

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

  const archiveSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('archiveSessionAtomFn', { root: true })(
        function* (arg: SessionTarget, get: Atom.FnContext) {
          yield* sessionSpan(arg);
          const snapshot = usableHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('archiveSession skipped; backend not usable', arg.launchTarget);
            return;
          }
          yield* requireAgentCapability(snapshot.agentCapabilities, arg.launchTarget, 'sessionArchive');

          yield* Effect.logInfo('Archiving session', arg.launchTarget, arg.sessionId);
          yield* archiveSession(arg.launchTarget, arg.sessionId);
          yield* updateAndClearSelection(get, arg.launchTarget, arg.sessionId, current =>
            setSessionArchived(current, arg.sessionId, true),
          );
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

  /** Optimistic title patch; on RPC failure restore the previous title only if it is still the optimistic one. */
  const renameSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('renameSessionAtomFn', { root: true })(
        function* (arg: SessionTarget & { readonly title: string }, get: Atom.FnContext) {
          yield* sessionSpan(arg);
          const snapshot = usableHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('renameSession skipped; backend not usable', arg.launchTarget);
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
          const snapshot = usableHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('deleteSession skipped; backend not usable', arg.launchTarget);
            return;
          }

          const session = arg.sessionId in snapshot.sessions ? snapshot.sessions[arg.sessionId] : undefined;
          if (session !== undefined && session.status !== 'inactive') {
            yield* Effect.logInfo('Closing session before delete', arg.launchTarget, arg.sessionId);
            yield* closeOnAgent(snapshot.agentCapabilities, arg.launchTarget, arg.sessionId);
          }

          yield* Effect.logInfo('Deleting session', arg.launchTarget, arg.sessionId);
          yield* deleteSession(arg.launchTarget, arg.sessionId);
          yield* deleteSessionDir(arg.sessionId).pipe(
            Effect.catchCause(cause =>
              Effect.logWarning('session dir cleanup failed', arg.launchTarget, arg.sessionId, cause),
            ),
          );

          yield* updateAndClearSelection(get, arg.launchTarget, arg.sessionId, current =>
            dropSession(current, arg.sessionId),
          );
          yield* removePins(get.registry, arg.launchTarget, [arg.sessionId]);
        },
        (effect, arg) =>
          effect.pipe(
            Effect.tapError(error =>
              Effect.logError('deleteSessionAtomFn failed', arg.launchTarget, arg.sessionId, error),
            ),
          ),
      ),
    )
    .pipe(Atom.keepAlive);

  return {
    activateSessionAtomFn,
    archiveSessionAtomFn,
    clearSelectedAtomFn,
    createSessionAtomFn,
    deactivateSessionAtomFn,
    deleteSessionAtomFn,
    forkSessionAtomFn,
    refreshAllSessionHistoriesAtomFn,
    refreshSessionHistoryAtomFn,
    renameSessionAtomFn,
    selectSessionAtomFn,
  };
};

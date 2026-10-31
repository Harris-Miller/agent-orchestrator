/** Session history / lifecycle Atom fns (create, activate, deactivate, delete, refresh). */
import { deleteSessionDir, readSessionUsage } from '@lib/ao-home';
import { Effect, Exit, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import {
  defectsFromActivationFailure,
  isSessionActiveOrActivating,
  normalizeConfigOptions,
  resolveSessionCwd,
} from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import {
  dropSession,
  markSessionInactive,
  replaceSessionHistory,
  upsertIntoSnapshot,
} from '../host/harnessStateTransitions.ts';
import { listSessionsPayload } from '../host/sessionListScope.ts';
import { applyConfigDiffs, buildActivatedSession, historyEntryFromNew } from '../host/sessionMaterialize.ts';
import { configValuesFromOptions } from '../host/configProbe.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { resetUnsupportedConfigValues } from '../host/configOptionIndexUi.ts';
import {
  archiveSession,
  closeSession,
  createSession,
  deleteSession,
  forkSession,
  listSessions,
  loadSession,
  resumeSession,
  setConfigOption,
} from '../host/sessionRpc.ts';

import {
  backendHarnessStateAtom,
  clearSelectedSessionIfMissing,
  configOptionIndexAtom,
  selectedAtom,
} from './backendState.atoms.ts';
import type { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { patchSession } from './sessionPatch.atoms.ts';
import { historyAfterList, rwFromFnContext } from './virtualBind.ts';
import { clearSelectedEffect, selectSessionEffect, virtualSessionAtom } from './virtualSession.atoms.ts';

/** Reset an activated session's model/options the Config option index no longer offers; soft-fails to the live configuration. */
const resetActivatedConfiguration = Effect.fn('resetActivatedConfiguration')(function* (
  launchTarget: AgentLaunchTarget,
  sessionId: string,
  sessionConfiguration: unknown,
  index: ConfigOptionIndex | undefined,
) {
  const liveValues = configValuesFromOptions(normalizeConfigOptions(sessionConfiguration));
  const reconciled = yield* applyConfigDiffs(
    sessionConfiguration,
    resetUnsupportedConfigValues(index, liveValues),
    diff => setConfigOption(launchTarget, sessionId, diff.configId, diff),
  ).pipe(
    Effect.catchCause(cause =>
      Effect.as(Effect.logWarning('Session config reset failed during activation', cause), { sessionConfiguration }),
    ),
  );
  return reconciled.sessionConfiguration;
});

type RefreshSessionFsListingAtomFn = ReturnType<typeof createSessionFsListingAtoms>['refreshSessionFsListingAtomFn'];

type SessionTarget = {
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

const sessionSpan = (arg: SessionTarget) =>
  Effect.annotateCurrentSpan({
    'acp.agent': arg.launchTarget,
    'acp.sessionId': arg.sessionId,
  });

const readyHarness = (get: Atom.FnContext, launchTarget: AgentLaunchTarget) => {
  const snapshot = get(backendHarnessStateAtom(launchTarget));
  return snapshot.phase === 'ready' ? snapshot : undefined;
};

const dropSessionAndClearSelection = Effect.fnUntraced(function* (
  get: Atom.FnContext,
  launchTarget: AgentLaunchTarget,
  snapshot: BackendHarnessSnapshot,
  sessionId: string,
) {
  get.set(backendHarnessStateAtom(launchTarget), dropSession(snapshot, sessionId));
  const selected = get(selectedAtom);
  if (selected?._tag === 'Session' && selected.sessionId === sessionId) {
    yield* clearSelectedEffect(rwFromFnContext(get));
  }
});

/** Cursor / Antigravity: best-effort close (agent may omit close). Other providers: fail-closed. */
const closeSessionForLaunchTarget = Effect.fnUntraced(function* (launchTarget: AgentLaunchTarget, sessionId: string) {
  if (launchTarget === 'cursor-acp' || launchTarget === 'antigravity-acp') {
    yield* Effect.exit(closeSession(launchTarget, sessionId));
    return;
  }
  yield* closeSession(launchTarget, sessionId);
});

export const createSessionLifecycleAtoms = (
  runtime: HostRuntimeBag,
  refreshSessionFsListingAtomFn: RefreshSessionFsListingAtomFn,
) => {
  const { atomRuntime } = runtime;

  const selectSessionAtomFn = atomRuntime
    .fn((sessionId: string, get: Atom.FnContext) => selectSessionEffect(rwFromFnContext(get), sessionId))
    .pipe(Atom.keepAlive);

  const clearSelectedAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) => clearSelectedEffect(rwFromFnContext(get)))
    .pipe(Atom.keepAlive);

  const refreshSessionHistoryAtomFn = atomRuntime
    .fn(
      Effect.fn('refreshSessionHistoryAtomFn', { root: true })(
        function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': launchTarget,
          });
          const snapshot = get(backendHarnessStateAtom(launchTarget));
          if (snapshot.phase !== 'ready') {
            yield* Effect.logDebug('refreshSessionHistory skipped; backend not ready', launchTarget);
            return;
          }

          const scope = get(sessionListScopeAtom);
          const listPayload = listSessionsPayload(scope);
          if (listPayload === undefined) {
            return;
          }

          yield* Effect.logDebug('Refreshing session history', launchTarget);
          const listResult = yield* listSessions(launchTarget, listPayload);
          const current = get(backendHarnessStateAtom(launchTarget));
          const boundSessionId = get(virtualSessionAtom)?.sessionId;
          get.set(
            backendHarnessStateAtom(launchTarget),
            replaceSessionHistory(current, historyAfterList(current.sessionHistory, listResult, scope, boundSessionId)),
          );
          clearSelectedSessionIfMissing(get);
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
        yield* Effect.forEach(
          MOUNTED_AGENT_LAUNCH_TARGETS,
          launchTarget =>
            Effect.gen(function* () {
              const snapshot = get(backendHarnessStateAtom(launchTarget));
              if (snapshot.phase !== 'ready') {
                return;
              }
              if (listPayload === undefined) {
                return;
              }
              const listResult = yield* listSessions(launchTarget, listPayload);
              const current = get(backendHarnessStateAtom(launchTarget));
              const boundSessionId = get(virtualSessionAtom)?.sessionId;
              get.set(
                backendHarnessStateAtom(launchTarget),
                replaceSessionHistory(
                  current,
                  historyAfterList(current.sessionHistory, listResult, scope, boundSessionId),
                ),
              );
            }),
          { concurrency: 'unbounded' },
        );
        clearSelectedSessionIfMissing(get);
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
          const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
          if (snapshot.phase !== 'ready') {
            yield* Effect.logWarning('createSession skipped; backend not ready', arg.launchTarget);
            return;
          }

          yield* Effect.logInfo('UI createSession', arg.launchTarget, { cwd: arg.cwd });
          const { cwd, result } = yield* createSession(arg.launchTarget, arg.cwd);
          const { sessionId } = result;
          yield* Effect.annotateCurrentSpan('acp.sessionId', sessionId);

          const session = buildActivatedSession(sessionId, result, { cwd });
          const historyEntry = historyEntryFromNew(result, cwd);
          const nextSnapshot = get(backendHarnessStateAtom(arg.launchTarget));

          get.set(
            backendHarnessStateAtom(arg.launchTarget),
            upsertIntoSnapshot(nextSnapshot, { historyEntry, session }),
          );
          yield* selectSessionEffect(rwFromFnContext(get), sessionId);
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
        const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
        if (snapshot.phase !== 'ready') {
          yield* Effect.logWarning('activateSession skipped; backend not ready', arg.launchTarget);
          return;
        }

        const hasLocalSnapshot = arg.sessionId in snapshot.sessions;
        const existingSession = hasLocalSnapshot ? snapshot.sessions[arg.sessionId] : undefined;
        const historyEntry = snapshot.sessionHistory.find(entry => entry.sessionId === arg.sessionId);
        const cwd = resolveSessionCwd(existingSession?.cwd, historyEntry?.cwd);

        yield* selectSessionEffect(rwFromFnContext(get), arg.sessionId);

        // Fresh session/new already materializes an active local snapshot. Re-entering via
        // session/load (empty transcript ⇒ load) breaks Codex ("no rollout found for thread id").
        if (existingSession !== undefined && isSessionActiveOrActivating(existingSession.status)) {
          yield* Effect.logInfo('activateSession skipped; already active/activating', arg.launchTarget, arg.sessionId);
          return;
        }

        if (cwd === undefined) {
          yield* Effect.logError('Session activation failed; session cwd missing', arg.launchTarget, arg.sessionId);
          get.set(backendHarnessStateAtom(arg.launchTarget), {
            ...snapshot,
            sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
              ...session,
              defects: [{ message: 'Session cwd missing from snapshot and history' }],
              status: 'inactive',
            })),
          });
          return;
        }

        // Cursor always `session/load` this issue (no resume heuristic). Codex/Claude keep ADR 0004.
        const alwaysLoad = arg.launchTarget === 'cursor-acp';
        const hasHistory = existingSession !== undefined && existingSession.transcript.items.length > 0;
        const useResume = !alwaysLoad && hasHistory;
        yield* Effect.logInfo('Activating session', arg.launchTarget, arg.sessionId, {
          cwd,
          mode: useResume ? 'resume' : 'load',
        });

        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
            ...session,
            cwd,
            defects: undefined,
            status: 'activating',
          })),
        });

        const exit = yield* Effect.exit(
          useResume
            ? resumeSession(arg.launchTarget, arg.sessionId, cwd)
            : loadSession(arg.launchTarget, arg.sessionId, cwd),
        );

        if (Exit.isFailure(exit)) {
          yield* Effect.logError('Session activation failed', arg.launchTarget, arg.sessionId);
          const current = get(backendHarnessStateAtom(arg.launchTarget));
          get.set(backendHarnessStateAtom(arg.launchTarget), {
            ...current,
            sessions: patchSession(current.sessions, arg.sessionId, session => ({
              ...session,
              defects: defectsFromActivationFailure(current.rpcCalls, exit.cause),
              status: 'inactive',
            })),
          });
          return;
        }

        const persistedUsage = Option.getOrUndefined(yield* readSessionUsage(arg.sessionId));
        const activatedSession = buildActivatedSession(
          arg.sessionId,
          exit.value,
          get(backendHarnessStateAtom(arg.launchTarget)).sessions[arg.sessionId],
        );
        const sessionConfiguration = yield* resetActivatedConfiguration(
          arg.launchTarget,
          arg.sessionId,
          activatedSession.sessionConfiguration,
          get(configOptionIndexAtom(arg.launchTarget)),
        );
        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...get(backendHarnessStateAtom(arg.launchTarget)),
          sessions: patchSession(get(backendHarnessStateAtom(arg.launchTarget)).sessions, arg.sessionId, session => ({
            ...buildActivatedSession(arg.sessionId, exit.value, session),
            sessionConfiguration,
            usage: persistedUsage,
          })),
        });
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
          const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
          if (snapshot.phase !== 'ready') {
            yield* Effect.logWarning('forkSession skipped; backend not ready', arg.launchTarget);
            return;
          }

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

          const nextSnapshot = get(backendHarnessStateAtom(arg.launchTarget));
          get.set(backendHarnessStateAtom(arg.launchTarget), upsertIntoSnapshot(nextSnapshot, { historyEntry }));

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
          const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
          if (snapshot.phase !== 'ready') {
            yield* Effect.logWarning('deactivateSession skipped; backend not ready', arg.launchTarget);
            return;
          }

          yield* Effect.logInfo('Deactivating session', arg.launchTarget, arg.sessionId);
          yield* closeSessionForLaunchTarget(arg.launchTarget, arg.sessionId);

          get.set(
            backendHarnessStateAtom(arg.launchTarget),
            markSessionInactive(get(backendHarnessStateAtom(arg.launchTarget)), arg.sessionId),
          );

          const selected = get(selectedAtom);
          if (selected?._tag === 'Session' && selected.sessionId === arg.sessionId) {
            yield* clearSelectedEffect(rwFromFnContext(get));
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
          const snapshot = readyHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('archiveSession skipped; backend not ready', arg.launchTarget);
            return;
          }

          yield* Effect.logInfo('Archiving session', arg.launchTarget, arg.sessionId);
          yield* archiveSession(arg.launchTarget, arg.sessionId);
          yield* dropSessionAndClearSelection(get, arg.launchTarget, snapshot, arg.sessionId);
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

  const deleteSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('deleteSessionAtomFn', { root: true })(
        function* (arg: SessionTarget, get: Atom.FnContext) {
          yield* sessionSpan(arg);
          const snapshot = readyHarness(get, arg.launchTarget);
          if (snapshot === undefined) {
            yield* Effect.logWarning('deleteSession skipped; backend not ready', arg.launchTarget);
            return;
          }

          const session = arg.sessionId in snapshot.sessions ? snapshot.sessions[arg.sessionId] : undefined;
          if (session !== undefined && session.status !== 'inactive') {
            yield* Effect.logInfo('Closing session before delete', arg.launchTarget, arg.sessionId);
            yield* closeSessionForLaunchTarget(arg.launchTarget, arg.sessionId);
          }

          yield* Effect.logInfo('Deleting session', arg.launchTarget, arg.sessionId);
          yield* deleteSession(arg.launchTarget, arg.sessionId);
          yield* deleteSessionDir(arg.sessionId).pipe(
            Effect.catchCause(cause =>
              Effect.logWarning('session dir cleanup failed', arg.launchTarget, arg.sessionId, cause),
            ),
          );

          yield* dropSessionAndClearSelection(get, arg.launchTarget, snapshot, arg.sessionId);
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
    selectSessionAtomFn,
  };
};

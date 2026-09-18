/** Session roster / lifecycle Atom fns (create, activate, deactivate, delete, refresh). */
import { deleteSessionDir, readSessionUsage } from '@lib/ao-home';
import { Effect, Exit, Option } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  defectsFromActivationFailure,
  normalizeSessionRoster,
  resolveSessionCwd,
  upsertRosterEntry,
} from '../acp/acpSessionBootstrap.ts';
import { ALL_AGENT_LAUNCH_TARGETS } from '../acp/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { applyConfigDiffs, buildActivatedSession, rosterEntryFromNew } from '../acp/sessionMaterialize.ts';
import {
  closeSession,
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  resumeSession,
  setConfigOption,
} from '../acp/sessionRpc.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import {
  backendHarnessStateAtom,
  clearSelectedSessionIfMissing,
  providerConfigAtom,
  selectedSessionIdAtom,
  selectSession,
} from './backendStateAtoms.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration, upsertSession } from './sessionPatch.ts';

export const selectSessionAtomFn = acpRuntime
  .fn((arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get) =>
    Effect.sync(() => {
      selectSession(get, arg.launchTarget, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const refreshSessionRosterAtomFn = acpRuntime
  .fn(
    Effect.fn('refreshSessionRosterAtomFn', { root: true })(
      function* (launchTarget: AgentLaunchTarget, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': launchTarget,
        });
        const snapshot = get(backendHarnessStateAtom(launchTarget));
        if (snapshot.phase !== 'ready') {
          yield* Effect.logDebug('refreshSessionRoster skipped; backend not ready', launchTarget);
          return;
        }

        yield* Effect.logDebug('Refreshing session roster', launchTarget);
        const listResult = yield* listSessions(launchTarget);
        const current = get(backendHarnessStateAtom(launchTarget));
        get.set(backendHarnessStateAtom(launchTarget), {
          ...current,
          sessionRoster: normalizeSessionRoster(listResult),
        });
        clearSelectedSessionIfMissing(get);
      },
      (effect, launchTarget) =>
        effect.pipe(Effect.tapError(error => Effect.logError('refreshSessionRoster failed', launchTarget, error))),
    ),
  )
  .pipe(Atom.keepAlive);

export const refreshAllSessionRostersAtomFn = acpRuntime
  .fn(
    Effect.fn('refreshAllSessionRostersAtomFn', { root: true })(function* (_arg: undefined, get: AcpAtomGet) {
      yield* Effect.forEach(
        ALL_AGENT_LAUNCH_TARGETS,
        launchTarget =>
          Effect.gen(function* () {
            const snapshot = get(backendHarnessStateAtom(launchTarget));
            if (snapshot.phase !== 'ready') {
              return;
            }
            const listResult = yield* listSessions(launchTarget);
            const current = get(backendHarnessStateAtom(launchTarget));
            get.set(backendHarnessStateAtom(launchTarget), {
              ...current,
              sessionRoster: normalizeSessionRoster(listResult),
            });
          }),
        { concurrency: 'unbounded' },
      );
      clearSelectedSessionIfMissing(get);
    }),
  )
  .pipe(Atom.keepAlive);

export const createSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('createSessionAtomFn', { root: true })(
      function* (arg: { cwd: string; launchTarget: AgentLaunchTarget }, get: AcpAtomGet) {
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

        syncProviderConfigFromSessionConfiguration(get, arg.launchTarget, result);

        const { defaults } = get(providerConfigAtom(arg.launchTarget)) ?? { defaults: {} };
        const { sessionConfiguration } = yield* applyConfigDiffs(result, defaults, (configId, value) =>
          setConfigOption(arg.launchTarget, sessionId, configId, value),
        );

        syncProviderConfigFromSessionConfiguration(get, arg.launchTarget, sessionConfiguration);

        const session = buildActivatedSession(sessionId, sessionConfiguration, { cwd });
        const rosterEntry = rosterEntryFromNew(result, cwd);
        const nextSnapshot = get(backendHarnessStateAtom(arg.launchTarget));

        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...nextSnapshot,
          sessionRoster:
            rosterEntry === undefined
              ? nextSnapshot.sessionRoster
              : upsertRosterEntry(nextSnapshot.sessionRoster, rosterEntry),
          sessions: upsertSession(nextSnapshot.sessions, session),
        });
        selectSession(get, arg.launchTarget, sessionId);
        yield* Effect.logInfo('UI createSession complete', arg.launchTarget, sessionId);
      },
      (effect, arg) =>
        effect.pipe(Effect.tapError(error => Effect.logError('createSessionAtomFn failed', arg.launchTarget, error))),
    ),
  )
  .pipe(Atom.keepAlive);

export const activateSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('activateSessionAtomFn', { root: true })(function* (
      arg: { launchTarget: AgentLaunchTarget; sessionId: string },
      get: AcpAtomGet,
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
      const rosterEntry = snapshot.sessionRoster.find(entry => entry.sessionId === arg.sessionId);
      const cwd = resolveSessionCwd(existingSession?.cwd, rosterEntry?.cwd);

      selectSession(get, arg.launchTarget, arg.sessionId);

      if (cwd === undefined) {
        yield* Effect.logError('Session activation failed; session cwd missing', arg.launchTarget, arg.sessionId);
        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
            ...session,
            defects: [{ message: 'Session cwd missing from snapshot and roster' }],
            status: 'inactive',
          })),
        });
        return;
      }

      const hasHistory = existingSession !== undefined && existingSession.transcript.items.length > 0;
      yield* Effect.logInfo('Activating session', arg.launchTarget, arg.sessionId, {
        cwd,
        mode: hasHistory ? 'resume' : 'load',
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
        hasHistory
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
      syncProviderConfigFromSessionConfiguration(get, arg.launchTarget, exit.value);
      get.set(backendHarnessStateAtom(arg.launchTarget), {
        ...get(backendHarnessStateAtom(arg.launchTarget)),
        sessions: patchSession(get(backendHarnessStateAtom(arg.launchTarget)).sessions, arg.sessionId, session => ({
          ...buildActivatedSession(arg.sessionId, exit.value, session),
          usage: persistedUsage,
        })),
      });
      yield* Effect.logInfo('Session activated', arg.launchTarget, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const deactivateSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('deactivateSessionAtomFn', { root: true })(
      function* (arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: AcpAtomGet) {
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
        yield* closeSession(arg.launchTarget, arg.sessionId);

        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...get(backendHarnessStateAtom(arg.launchTarget)),
          sessions: patchSession(get(backendHarnessStateAtom(arg.launchTarget)).sessions, arg.sessionId, session => ({
            ...session,
            status: 'inactive',
          })),
        });

        if (get(selectedSessionIdAtom) === arg.sessionId) {
          get.set(selectedSessionIdAtom, undefined);
        }
      },
      (effect, arg) =>
        effect.pipe(
          Effect.tapError(error => Effect.logError('deactivateSession failed', arg.launchTarget, arg.sessionId, error)),
        ),
    ),
  )
  .pipe(Atom.keepAlive);

export const deleteSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('deleteSessionAtomFn', { root: true })(
      function* (arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.launchTarget,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
        if (snapshot.phase !== 'ready') {
          yield* Effect.logWarning('deleteSession skipped; backend not ready', arg.launchTarget);
          return;
        }

        if (arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].status !== 'inactive') {
          yield* Effect.logWarning('deleteSession refused; session not inactive', arg.launchTarget, arg.sessionId);
          return;
        }

        yield* Effect.logInfo('Deleting session', arg.launchTarget, arg.sessionId);
        yield* deleteSession(arg.launchTarget, arg.sessionId);
        yield* deleteSessionDir(arg.sessionId).pipe(
          Effect.catchCause(cause =>
            Effect.logWarning('session dir cleanup failed', arg.launchTarget, arg.sessionId, cause),
          ),
        );

        const { [arg.sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
        const sessionRoster = snapshot.sessionRoster.filter(entry => entry.sessionId !== arg.sessionId);

        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...snapshot,
          sessionRoster,
          sessions: remainingSessions,
        });

        if (get(selectedSessionIdAtom) === arg.sessionId) {
          get.set(selectedSessionIdAtom, undefined);
        }
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

/** Session roster / lifecycle Atom fns (create, activate, deactivate, delete, refresh). */
import { Effect, Exit } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  applySetConfigOptionResult,
  defectsFromActivationFailure,
  normalizeSessionInfoFromNew,
  normalizeSessionRoster,
  patchConfigOptionValue,
  resolveSessionCwd,
  upsertRosterEntry,
} from '../acp/acpSessionBootstrap.ts';
import { ALL_AGENT_LAUNCH_TARGETS } from '../acp/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { harnessDefaultDiffs } from '../acp/providerConfigStorage.ts';
import {
  closeSession,
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  resumeSession,
  setConfigOption,
} from '../acp/sessionRpc.ts';
import { readPersistedSessionUsage } from '../acp/sessionUsageStorage.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import {
  backendHarnessStateAtom,
  clearSelectedSessionIfMissing,
  providerConfigAtom,
  selectedSessionIdAtom,
  selectSession,
} from './backendStateAtoms.ts';
import {
  applySessionActivationResult,
  patchSession,
  syncProviderConfigFromSessionConfiguration,
  upsertSession,
} from './sessionPatch.ts';

export const selectSessionAtomFn = acpRuntime
  .fn((arg: { backend: AgentLaunchTarget; sessionId: string }, get) =>
    Effect.sync(() => {
      selectSession(get, arg.backend, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const refreshSessionRosterAtomFn = acpRuntime
  .fn(
    Effect.fn('refreshSessionRosterAtomFn', { root: true })(
      function* (backend: AgentLaunchTarget, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': backend,
        });
        const snapshot = get(backendHarnessStateAtom(backend));
        if (snapshot.phase !== 'ready') {
          yield* Effect.logDebug('refreshSessionRoster skipped; backend not ready', backend);
          return;
        }

        yield* Effect.logDebug('Refreshing session roster', backend);
        const listResult = yield* listSessions(backend);
        const current = get(backendHarnessStateAtom(backend));
        get.set(backendHarnessStateAtom(backend), {
          ...current,
          sessionRoster: normalizeSessionRoster(listResult),
        });
        clearSelectedSessionIfMissing(get);
      },
      (effect, backend) =>
        effect.pipe(Effect.tapError(error => Effect.logError('refreshSessionRoster failed', backend, error))),
    ),
  )
  .pipe(Atom.keepAlive);

export const refreshAllSessionRostersAtomFn = acpRuntime
  .fn(
    Effect.fn('refreshAllSessionRostersAtomFn', { root: true })(function* (_arg: undefined, get: AcpAtomGet) {
      yield* Effect.forEach(
        ALL_AGENT_LAUNCH_TARGETS,
        backend =>
          Effect.gen(function* () {
            const snapshot = get(backendHarnessStateAtom(backend));
            if (snapshot.phase !== 'ready') {
              return;
            }
            const listResult = yield* listSessions(backend);
            const current = get(backendHarnessStateAtom(backend));
            get.set(backendHarnessStateAtom(backend), {
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
      function* (arg: { backend: AgentLaunchTarget; cwd: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
        });
        const snapshot = get(backendHarnessStateAtom(arg.backend));
        if (snapshot.phase !== 'ready') {
          yield* Effect.logWarning('createSession skipped; backend not ready', arg.backend);
          return;
        }

        yield* Effect.logInfo('UI createSession', arg.backend, { cwd: arg.cwd });
        const { cwd, result } = yield* createSession(arg.backend, arg.cwd);
        const { sessionId } = result;
        yield* Effect.annotateCurrentSpan('acp.sessionId', sessionId);

        syncProviderConfigFromSessionConfiguration(get, arg.backend, result);

        let sessionConfiguration: unknown = result;
        const { defaults } = get(providerConfigAtom(arg.backend)) ?? { defaults: {} };
        for (const diff of harnessDefaultDiffs(sessionConfiguration, defaults)) {
          const patched = patchConfigOptionValue(sessionConfiguration, diff.configId, diff.value);
          const exit = yield* Effect.exit(setConfigOption(arg.backend, sessionId, diff.configId, diff.value));
          if (Exit.isFailure(exit)) {
            yield* Effect.logWarning('Default config option apply failed during create', arg.backend, diff.configId);
            break;
          }
          const { sessionConfiguration: nextSessionState } = applySetConfigOptionResult(patched, exit.value);
          sessionConfiguration = nextSessionState;
        }

        syncProviderConfigFromSessionConfiguration(get, arg.backend, sessionConfiguration);

        const session = applySessionActivationResult(sessionId, sessionConfiguration, { cwd });
        const rosterEntry = normalizeSessionInfoFromNew(result, cwd);
        const nextSnapshot = get(backendHarnessStateAtom(arg.backend));

        get.set(backendHarnessStateAtom(arg.backend), {
          ...nextSnapshot,
          sessionRoster:
            rosterEntry === undefined
              ? nextSnapshot.sessionRoster
              : upsertRosterEntry(nextSnapshot.sessionRoster, rosterEntry),
          sessions: upsertSession(nextSnapshot.sessions, session),
        });
        selectSession(get, arg.backend, sessionId);
        yield* Effect.logInfo('UI createSession complete', arg.backend, sessionId);
      },
      (effect, arg) =>
        effect.pipe(Effect.tapError(error => Effect.logError('createSessionAtomFn failed', arg.backend, error))),
    ),
  )
  .pipe(Atom.keepAlive);

export const activateSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('activateSessionAtomFn', { root: true })(function* (
      arg: { backend: AgentLaunchTarget; sessionId: string },
      get: AcpAtomGet,
    ) {
      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': arg.sessionId,
      });
      const snapshot = get(backendHarnessStateAtom(arg.backend));
      if (snapshot.phase !== 'ready') {
        yield* Effect.logWarning('activateSession skipped; backend not ready', arg.backend);
        return;
      }

      const hasLocalSnapshot = arg.sessionId in snapshot.sessions;
      const existingSession = hasLocalSnapshot ? snapshot.sessions[arg.sessionId] : undefined;
      const rosterEntry = snapshot.sessionRoster.find(entry => entry.sessionId === arg.sessionId);
      const cwd = resolveSessionCwd(existingSession?.cwd, rosterEntry?.cwd);

      selectSession(get, arg.backend, arg.sessionId);

      if (cwd === undefined) {
        yield* Effect.logError('Session activation failed; session cwd missing', arg.backend, arg.sessionId);
        get.set(backendHarnessStateAtom(arg.backend), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
            ...session,
            defects: [{ message: 'Session cwd missing from snapshot and roster' }],
            status: 'inactive',
          })),
        });
        return;
      }

      const hasHistory = existingSession !== undefined && existingSession.chatItems.length > 0;
      yield* Effect.logInfo('Activating session', arg.backend, arg.sessionId, {
        cwd,
        mode: hasHistory ? 'resume' : 'load',
      });

      get.set(backendHarnessStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
          ...session,
          cwd,
          defects: undefined,
          status: 'activating',
        })),
      });

      const exit = yield* Effect.exit(
        hasHistory ? resumeSession(arg.backend, arg.sessionId, cwd) : loadSession(arg.backend, arg.sessionId, cwd),
      );

      if (Exit.isFailure(exit)) {
        yield* Effect.logError('Session activation failed', arg.backend, arg.sessionId);
        const current = get(backendHarnessStateAtom(arg.backend));
        get.set(backendHarnessStateAtom(arg.backend), {
          ...current,
          sessions: patchSession(current.sessions, arg.sessionId, session => ({
            ...session,
            defects: defectsFromActivationFailure(current.rpcCalls, exit.cause),
            status: 'inactive',
          })),
        });
        return;
      }

      const persistedUsage = readPersistedSessionUsage(arg.sessionId);
      syncProviderConfigFromSessionConfiguration(get, arg.backend, exit.value);
      get.set(backendHarnessStateAtom(arg.backend), {
        ...get(backendHarnessStateAtom(arg.backend)),
        sessions: patchSession(get(backendHarnessStateAtom(arg.backend)).sessions, arg.sessionId, session => ({
          ...applySessionActivationResult(arg.sessionId, exit.value, session),
          usage: persistedUsage,
        })),
      });
      yield* Effect.logInfo('Session activated', arg.backend, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const deactivateSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('deactivateSessionAtomFn', { root: true })(
      function* (arg: { backend: AgentLaunchTarget; sessionId: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendHarnessStateAtom(arg.backend));
        if (snapshot.phase !== 'ready') {
          yield* Effect.logWarning('deactivateSession skipped; backend not ready', arg.backend);
          return;
        }

        yield* Effect.logInfo('Deactivating session', arg.backend, arg.sessionId);
        yield* closeSession(arg.backend, arg.sessionId);

        get.set(backendHarnessStateAtom(arg.backend), {
          ...get(backendHarnessStateAtom(arg.backend)),
          sessions: patchSession(get(backendHarnessStateAtom(arg.backend)).sessions, arg.sessionId, session => ({
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
          Effect.tapError(error => Effect.logError('deactivateSession failed', arg.backend, arg.sessionId, error)),
        ),
    ),
  )
  .pipe(Atom.keepAlive);

export const deleteSessionAtomFn = acpRuntime
  .fn(
    Effect.fn('deleteSessionAtomFn', { root: true })(
      function* (arg: { backend: AgentLaunchTarget; sessionId: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendHarnessStateAtom(arg.backend));
        if (snapshot.phase !== 'ready') {
          yield* Effect.logWarning('deleteSession skipped; backend not ready', arg.backend);
          return;
        }

        if (arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].status !== 'inactive') {
          yield* Effect.logWarning('deleteSession refused; session not inactive', arg.backend, arg.sessionId);
          return;
        }

        yield* Effect.logInfo('Deleting session', arg.backend, arg.sessionId);
        yield* deleteSession(arg.backend, arg.sessionId);

        const { [arg.sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
        const sessionRoster = snapshot.sessionRoster.filter(entry => entry.sessionId !== arg.sessionId);

        get.set(backendHarnessStateAtom(arg.backend), {
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
          Effect.tapError(error => Effect.logError('deleteSessionAtomFn failed', arg.backend, arg.sessionId, error)),
        ),
    ),
  )
  .pipe(Atom.keepAlive);

/** Session roster / lifecycle Atom fns (create, activate, deactivate, delete, refresh). */
import { Effect, Exit } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  ALL_ACP_BACKENDS,
  applySetConfigOptionResult,
  defectsFromActivationFailure,
  normalizeSessionInfoFromNew,
  normalizeSessionRoster,
  patchConfigOptionValue,
  upsertRosterEntry,
} from '../acp/acpSessionBootstrap.ts';
import type { AcpAgentBackend } from '../acp/agentHarness.ts';
import {
  closeSession,
  createSession,
  deleteSession,
  getAgentHandle,
  listSessions,
  loadSession,
  resumeSession,
  setConfigOption,
} from '../acp/agentHarness.ts';
import { harnessDefaultDiffs } from '../acp/providerConfigStorage.ts';
import { readPersistedSessionUsage } from '../acp/sessionUsageStorage.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import {
  backendStateAtom,
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

export const selectSessionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; sessionId: string }, get) =>
    Effect.sync(() => {
      selectSession(get, arg.backend, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const refreshSessionRosterFn = acpRuntime
  .fn(
    Effect.fn('refreshSessionRosterFn', { root: true })(
      function* (backend: AcpAgentBackend, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': backend,
        });
        const agent = getAgentHandle(backend);
        if (agent === undefined) {
          yield* Effect.logDebug('refreshSessionRoster skipped; no agent', backend);
          return;
        }

        yield* Effect.logDebug('Refreshing session roster', backend);
        const listResult = yield* listSessions(agent);
        const snapshot = get(backendStateAtom(backend));
        get.set(backendStateAtom(backend), {
          ...snapshot,
          sessionRoster: normalizeSessionRoster(listResult),
        });
        clearSelectedSessionIfMissing(get);
      },
      (effect, backend) =>
        effect.pipe(Effect.tapError(error => Effect.logError('refreshSessionRoster failed', backend, error))),
    ),
  )
  .pipe(Atom.keepAlive);

export const refreshAllSessionRostersFn = acpRuntime
  .fn(
    Effect.fn('refreshAllSessionRostersFn', { root: true })(function* (_arg: undefined, get: AcpAtomGet) {
      yield* Effect.forEach(
        ALL_ACP_BACKENDS,
        backend =>
          Effect.gen(function* () {
            const agent = getAgentHandle(backend);
            if (agent === undefined) {
              return;
            }
            const listResult = yield* listSessions(agent);
            const snapshot = get(backendStateAtom(backend));
            get.set(backendStateAtom(backend), {
              ...snapshot,
              sessionRoster: normalizeSessionRoster(listResult),
            });
          }),
        { concurrency: 'unbounded' },
      );
      clearSelectedSessionIfMissing(get);
    }),
  )
  .pipe(Atom.keepAlive);

export const createSessionFn = acpRuntime
  .fn(
    Effect.fn('createSessionFn', { root: true })(
      function* (arg: { backend: AcpAgentBackend; cwd: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
        });
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          yield* Effect.logWarning('createSession skipped; no agent', arg.backend);
          return;
        }

        yield* Effect.logInfo('UI createSession', arg.backend, { cwd: arg.cwd });
        const { cwd, result } = yield* createSession(agent, arg.cwd);
        const { sessionId } = result;
        yield* Effect.annotateCurrentSpan('acp.sessionId', sessionId);

        syncProviderConfigFromSessionConfiguration(get, arg.backend, result);

        let sessionState: unknown = result;
        const { defaults } = get(providerConfigAtom(arg.backend)) ?? { defaults: {} };
        for (const diff of harnessDefaultDiffs(sessionState, defaults)) {
          const patched = patchConfigOptionValue(sessionState, diff.configId, diff.value);
          const exit = yield* Effect.exit(setConfigOption(agent, sessionId, diff.configId, diff.value));
          if (Exit.isFailure(exit)) {
            yield* Effect.logWarning('Default config option apply failed during create', arg.backend, diff.configId);
            break;
          }
          const { sessionState: nextSessionState } = applySetConfigOptionResult(patched, exit.value);
          sessionState = nextSessionState;
        }

        syncProviderConfigFromSessionConfiguration(get, arg.backend, sessionState);

        const session = applySessionActivationResult(sessionId, sessionState);
        const rosterEntry = normalizeSessionInfoFromNew(result, cwd);
        const snapshot = get(backendStateAtom(arg.backend));

        get.set(backendStateAtom(arg.backend), {
          ...snapshot,
          sessionRoster:
            rosterEntry === undefined ? snapshot.sessionRoster : upsertRosterEntry(snapshot.sessionRoster, rosterEntry),
          sessions: upsertSession(snapshot.sessions, session),
        });
        selectSession(get, arg.backend, sessionId);
        yield* Effect.logInfo('UI createSession complete', arg.backend, sessionId);
      },
      (effect, arg) =>
        effect.pipe(Effect.tapError(error => Effect.logError('createSessionFn failed', arg.backend, error))),
    ),
  )
  .pipe(Atom.keepAlive);

export const activateSessionFn = acpRuntime
  .fn(
    Effect.fn('activateSessionFn', { root: true })(function* (
      arg: { backend: AcpAgentBackend; sessionId: string },
      get: AcpAtomGet,
    ) {
      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': arg.sessionId,
      });
      const agent = getAgentHandle(arg.backend);
      if (agent === undefined) {
        yield* Effect.logWarning('activateSession skipped; no agent', arg.backend);
        return;
      }

      const snapshot = get(backendStateAtom(arg.backend));
      const hasHistory = arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].chatItems.length > 0;
      yield* Effect.logInfo('Activating session', arg.backend, arg.sessionId, {
        mode: hasHistory ? 'resume' : 'load',
      });

      selectSession(get, arg.backend, arg.sessionId);
      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
          ...session,
          defects: undefined,
          status: 'activating',
        })),
      });

      const exit = yield* Effect.exit(
        hasHistory ? resumeSession(agent, arg.sessionId) : loadSession(agent, arg.sessionId),
      );

      if (Exit.isFailure(exit)) {
        yield* Effect.logError('Session activation failed', arg.backend, arg.sessionId);
        const current = get(backendStateAtom(arg.backend));
        get.set(backendStateAtom(arg.backend), {
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
      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, arg.sessionId, session => ({
          ...applySessionActivationResult(arg.sessionId, exit.value, session),
          usage: persistedUsage,
        })),
      });
      yield* Effect.logInfo('Session activated', arg.backend, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const deactivateSessionFn = acpRuntime
  .fn(
    Effect.fn('deactivateSessionFn', { root: true })(
      function* (arg: { backend: AcpAgentBackend; sessionId: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          yield* Effect.logWarning('deactivateSession skipped; no agent', arg.backend);
          return;
        }

        yield* Effect.logInfo('Deactivating session', arg.backend, arg.sessionId);
        yield* closeSession(agent, arg.sessionId);

        get.set(backendStateAtom(arg.backend), {
          ...get(backendStateAtom(arg.backend)),
          sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, arg.sessionId, session => ({
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

export const deleteSessionFn = acpRuntime
  .fn(
    Effect.fn('deleteSessionFn', { root: true })(
      function* (arg: { backend: AcpAgentBackend; sessionId: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          yield* Effect.logWarning('deleteSession skipped; no agent', arg.backend);
          return;
        }

        const snapshot = get(backendStateAtom(arg.backend));
        if (arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].status !== 'inactive') {
          yield* Effect.logWarning('deleteSession refused; session not inactive', arg.backend, arg.sessionId);
          return;
        }

        yield* Effect.logInfo('Deleting session', arg.backend, arg.sessionId);
        yield* deleteSession(agent, arg.sessionId);

        const { [arg.sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
        const sessionRoster = snapshot.sessionRoster.filter(entry => entry.sessionId !== arg.sessionId);

        get.set(backendStateAtom(arg.backend), {
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
          Effect.tapError(error => Effect.logError('deleteSessionFn failed', arg.backend, arg.sessionId, error)),
        ),
    ),
  )
  .pipe(Atom.keepAlive);

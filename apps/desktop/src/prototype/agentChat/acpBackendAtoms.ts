/** Effect Atom state for parallel ACP backend harnesses. */
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';
import { isRecord } from '../../utils.ts';

import {
  ALL_ACP_BACKENDS,
  applySetConfigOptionResult,
  backendLabel,
  initialBackendSnapshot,
  initialSessionSnapshot,
  normalizeConfigOptions,
  normalizeSessionInfoFromNew,
  normalizeSessionRoster,
  patchConfigOptionValue,
  selectedSessionSnapshot,
  selectionFromSessionConfiguration,
  upsertRosterEntry,
} from './acpSessionBootstrap.ts';
import type { BackendSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';
import {
  appendBackendUserChatItem,
  closeSession,
  createSession,
  deleteSession,
  getAgentHandle,
  loadSession,
  resetBackendHarnessState,
  resumeSession,
  runBackendHarness,
  sendPrompt,
  setConfigOption,
  stopBackendHarness,
} from './agentHarness.ts';

const acpRuntime = Atom.runtime(() => TauriServicesLive);

export const selectedBackendAtom = Atom.make<AcpAgentBackend>('echo').pipe(Atom.keepAlive);

export const backendStateAtom = Atom.family((backend: AcpAgentBackend) =>
  Atom.make(initialBackendSnapshot()).pipe(Atom.withLabel(`backendState:${backend}`), Atom.keepAlive),
);

export const draftAtom = Atom.family((_backend: AcpAgentBackend) => Atom.make('').pipe(Atom.keepAlive));

export const activeSnapshotAtom = Atom.make(get => get(backendStateAtom(get(selectedBackendAtom)))).pipe(
  Atom.keepAlive,
);

export const selectedSessionAtom = Atom.make(get => {
  const snapshot = get(activeSnapshotAtom);
  return selectedSessionSnapshot(snapshot);
}).pipe(Atom.keepAlive);

export const allBackendPhasesAtom = Atom.make(get =>
  ALL_ACP_BACKENDS.map(backend => ({
    backend,
    error: get(backendStateAtom(backend)).error,
    label: backendLabel(backend),
    phase: get(backendStateAtom(backend)).phase,
  })),
).pipe(Atom.keepAlive);

const applySessionActivationResult = (
  sessionId: string,
  result: unknown,
  existing?: SessionSnapshot,
): SessionSnapshot => {
  const selection = selectionFromSessionConfiguration(result);
  return {
    availableCommands: existing?.availableCommands,
    chatItems: existing?.chatItems ?? [],
    pendingClientRequest: false,
    selectedModeId: selection.selectedModeId,
    selectedModelId: selection.selectedModelId,
    sessionId,
    sessionState: result,
    status: 'active',
    usage: existing?.usage,
  };
};

const upsertSession = (
  sessions: Readonly<Record<string, SessionSnapshot>>,
  session: SessionSnapshot,
): Readonly<Record<string, SessionSnapshot>> => ({
  ...sessions,
  [session.sessionId]: session,
});

const patchSession = (
  sessions: Readonly<Record<string, SessionSnapshot>>,
  sessionId: string,
  patch: (current: SessionSnapshot) => SessionSnapshot,
): Readonly<Record<string, SessionSnapshot>> => {
  const current = sessions[sessionId] ?? initialSessionSnapshot(sessionId);
  return upsertSession(sessions, patch(current));
};

type AcpAtomGet = Parameters<Parameters<typeof acpRuntime.fn>[0]>[1];

const withSessionClientRequest = <A, E, R>(
  backend: AcpAgentBackend,
  get: AcpAtomGet,
  sessionId: string,
  rpc: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const snapshot = get(backendStateAtom(backend));
    const session = snapshot.sessions[sessionId];
    const agent = getAgentHandle(backend);

    if (session.status !== 'active' || session.pendingClientRequest === true || agent === undefined) {
      return undefined as A;
    }

    get.set(backendStateAtom(backend), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => ({
        ...current,
        pendingClientRequest: true,
      })),
    });

    return yield* rpc.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          const currentSnapshot = get(backendStateAtom(backend));
          get.set(backendStateAtom(backend), {
            ...currentSnapshot,
            sessions: patchSession(currentSnapshot.sessions, sessionId, current => ({
              ...current,
              pendingClientRequest: false,
            })),
          });
        }),
      ),
    );
  });

export const backendHarnessAtom = Atom.family((backend: AcpAgentBackend) =>
  acpRuntime
    .atom(get => {
      const updateState = (patch: (current: BackendSnapshot) => BackendSnapshot) => {
        get.registry.update(backendStateAtom(backend), patch);
      };

      return runBackendHarness(backend, {
        onCommandsReady: (sessionId, availableCommands) => {
          updateState(current => ({
            ...current,
            sessions: patchSession(current.sessions, sessionId, session => ({
              ...session,
              availableCommands,
            })),
          }));
        },
        onInitializeResult: initializeResult => {
          updateState(current => ({
            ...current,
            initializeResult,
            phase: 'initialized',
          }));
        },
        onPhase: (phase, error) => {
          updateState(current => ({
            ...current,
            error,
            phase,
          }));
        },
        onRpcMessage: (direction, message) => {
          updateState(current => ({
            ...current,
            rpcCalls: [...current.rpcCalls, { direction, id: crypto.randomUUID(), message }],
          }));
        },
        onSessionRosterResult: listResult => {
          updateState(current => ({
            ...current,
            phase: 'ready',
            sessionRoster: normalizeSessionRoster(listResult),
          }));
        },
        onSessionUpdate: (sessionId, chatItems, update) => {
          updateState(current => {
            const skipConfigSync = sessionId in current.sessions && current.sessions[sessionId].status === 'activating';

            let sessions = patchSession(current.sessions, sessionId, session => ({
              ...session,
              chatItems,
            }));

            if (!skipConfigSync && isRecord(update)) {
              if (update.sessionUpdate === 'config_option_update' && Array.isArray(update.configOptions)) {
                sessions = patchSession(sessions, sessionId, session => {
                  const applied = applySetConfigOptionResult(session.sessionState, {
                    configOptions: update.configOptions,
                  });
                  return {
                    ...session,
                    selectedModeId: applied.selectedModeId ?? session.selectedModeId,
                    selectedModelId: applied.selectedModelId ?? session.selectedModelId,
                    sessionState: applied.sessionState,
                  };
                });
              }
            }

            return {
              ...current,
              sessions,
            };
          });
        },
        onUsageUpdate: (sessionId, usage) => {
          updateState(current => ({
            ...current,
            sessions: patchSession(current.sessions, sessionId, session => ({
              ...session,
              usage,
            })),
          }));
        },
      });
    })
    .pipe(Atom.keepAlive),
);

export const selectSessionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; sessionId: string }, get) =>
    Effect.sync(() => {
      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        selectedSessionId: arg.sessionId,
      });
    }),
  )
  .pipe(Atom.keepAlive);

export const createSessionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; cwd: string }, get) =>
    Effect.gen(function* () {
      const agent = getAgentHandle(arg.backend);
      if (agent === undefined) {
        return;
      }

      const { cwd, result } = yield* createSession(agent, arg.cwd);
      const { sessionId } = result;
      const session = applySessionActivationResult(sessionId, result);
      const rosterEntry = normalizeSessionInfoFromNew(result, cwd);
      const snapshot = get(backendStateAtom(arg.backend));

      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        selectedSessionId: sessionId,
        sessionRoster:
          rosterEntry === undefined ? snapshot.sessionRoster : upsertRosterEntry(snapshot.sessionRoster, rosterEntry),
        sessions: upsertSession(snapshot.sessions, session),
      });
    }),
  )
  .pipe(Atom.keepAlive);

export const activateSessionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; sessionId: string }, get) =>
    Effect.gen(function* () {
      const agent = getAgentHandle(arg.backend);
      if (agent === undefined) {
        return;
      }

      const snapshot = get(backendStateAtom(arg.backend));
      const hasHistory = arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].chatItems.length > 0;

      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        selectedSessionId: arg.sessionId,
        sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
          ...session,
          status: 'activating',
        })),
      });

      const result = hasHistory
        ? yield* resumeSession(agent, arg.backend, arg.sessionId)
        : yield* loadSession(agent, arg.backend, arg.sessionId);

      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, arg.sessionId, session =>
          applySessionActivationResult(arg.sessionId, result, session),
        ),
      });
    }),
  )
  .pipe(Atom.keepAlive);

export const deactivateSessionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; sessionId: string }, get) =>
    Effect.gen(function* () {
      const agent = getAgentHandle(arg.backend);
      if (agent === undefined) {
        return;
      }

      yield* closeSession(agent, arg.sessionId);

      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, arg.sessionId, session => ({
          ...session,
          status: 'inactive',
        })),
      });
    }),
  )
  .pipe(Atom.keepAlive);

export const deleteSessionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; sessionId: string }, get) =>
    Effect.gen(function* () {
      const agent = getAgentHandle(arg.backend);
      if (agent === undefined) {
        return;
      }

      const snapshot = get(backendStateAtom(arg.backend));
      if (arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].status !== 'inactive') {
        return;
      }

      yield* deleteSession(agent, arg.sessionId);

      const { [arg.sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
      const selectedSessionId = snapshot.selectedSessionId === arg.sessionId ? undefined : snapshot.selectedSessionId;
      const sessionRoster = snapshot.sessionRoster.filter(entry => entry.sessionId !== arg.sessionId);

      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        selectedSessionId,
        sessionRoster,
        sessions: remainingSessions,
      });
    }),
  )
  .pipe(Atom.keepAlive);

export const sendChatItemFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; text: string }, get) =>
    Effect.gen(function* () {
      const trimmed = arg.text.trim();
      const snapshot = get(backendStateAtom(arg.backend));
      const session = selectedSessionSnapshot(snapshot);

      if (trimmed.length === 0 || session?.status !== 'active') {
        return;
      }

      const chatItems = appendBackendUserChatItem(arg.backend, session.sessionId, trimmed);
      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          chatItems,
        })),
      });

      yield* withSessionClientRequest(
        arg.backend,
        get,
        session.sessionId,
        Effect.gen(function* () {
          const agent = getAgentHandle(arg.backend);
          if (agent === undefined) {
            return;
          }
          yield* sendPrompt(agent, session.sessionId, trimmed);
        }),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const restartBackendFn = acpRuntime
  .fn((backend: AcpAgentBackend, get) =>
    Effect.gen(function* () {
      yield* stopBackendHarness(backend);
      resetBackendHarnessState(backend);
      get.set(backendStateAtom(backend), initialBackendSnapshot());
      get.refresh(backendHarnessAtom(backend));
    }),
  )
  .pipe(Atom.keepAlive);

export const setConfigOptionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; configId: string; value: string }, get) =>
    Effect.gen(function* () {
      const snapshot = get(backendStateAtom(arg.backend));
      const session = selectedSessionSnapshot(snapshot);
      const currentValue = normalizeConfigOptions(session?.sessionState).find(
        option => option.id === arg.configId,
      )?.currentValue;

      if (session?.status !== 'active' || currentValue === arg.value) {
        return;
      }

      const previousModeId = session.selectedModeId;
      const previousModelId = session.selectedModelId;
      const previousSessionState = session.sessionState;
      const patchedSessionState = patchConfigOptionValue(session.sessionState, arg.configId, arg.value);
      const selection = selectionFromSessionConfiguration(patchedSessionState);

      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          selectedModeId: selection.selectedModeId ?? current.selectedModeId,
          selectedModelId: selection.selectedModelId ?? current.selectedModelId,
          sessionState: patchedSessionState,
        })),
      });

      const rpc = Effect.gen(function* () {
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          return;
        }

        const result = yield* setConfigOption(agent, session.sessionId, arg.configId, arg.value);
        const currentSnapshot = get(backendStateAtom(arg.backend));
        const applied = applySetConfigOptionResult(currentSnapshot.sessions[session.sessionId].sessionState, result);
        get.set(backendStateAtom(arg.backend), {
          ...currentSnapshot,
          sessions: patchSession(currentSnapshot.sessions, session.sessionId, current => ({
            ...current,
            selectedModeId: applied.selectedModeId ?? current.selectedModeId,
            selectedModelId: applied.selectedModelId ?? current.selectedModelId,
            sessionState: applied.sessionState,
          })),
        });
      });

      yield* withSessionClientRequest(arg.backend, get, session.sessionId, rpc).pipe(
        Effect.tapError(() =>
          Effect.sync(() => {
            get.set(backendStateAtom(arg.backend), {
              ...get(backendStateAtom(arg.backend)),
              sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, session.sessionId, current => ({
                ...current,
                selectedModeId: previousModeId,
                selectedModelId: previousModelId,
                sessionState: previousSessionState,
              })),
            });
          }),
        ),
      );
    }),
  )
  .pipe(Atom.keepAlive);

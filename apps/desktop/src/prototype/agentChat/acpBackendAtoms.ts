/** Effect Atom state for parallel ACP backend harnesses. */
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';

import {
  ALL_ACP_BACKENDS,
  backendLabel,
  initialBackendSnapshot,
  initialSessionSnapshot,
  normalizeModels,
  normalizeModes,
  normalizeSessionRoster,
  selectedSessionSnapshot,
} from './acpSessionBootstrap.ts';
import type { BackendSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';
import {
  appendBackendUserChatItem,
  closeSession,
  createSession,
  deleteSession,
  getAgentHandle,
  listSessions,
  loadSession,
  resetBackendHarnessState,
  resumeSession,
  runBackendHarness,
  sendPrompt,
  setConfigOption,
  setMode,
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
  const modes = normalizeModes(result);
  const models = normalizeModels(result);
  return {
    availableCommands: existing?.availableCommands,
    chatItems: existing?.chatItems ?? [],
    selectedModeId: modes.currentId,
    selectedModelId: models.currentId,
    sessionId,
    sessionState: result,
    status: 'active',
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
        onSessionUpdate: (sessionId, chatItems, _update) => {
          updateState(current => ({
            ...current,
            sessions: patchSession(current.sessions, sessionId, session => ({
              ...session,
              chatItems,
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
  .fn((backend: AcpAgentBackend, get) =>
    Effect.gen(function* () {
      const agent = getAgentHandle(backend);
      if (agent === undefined) {
        return;
      }

      const result = yield* createSession(agent, backend);
      const { sessionId } = result;
      const session = applySessionActivationResult(sessionId, result);

      get.set(backendStateAtom(backend), {
        ...get(backendStateAtom(backend)),
        selectedSessionId: sessionId,
        sessions: upsertSession(get(backendStateAtom(backend)).sessions, session),
      });

      const listResult = yield* listSessions(agent);
      get.set(backendStateAtom(backend), {
        ...get(backendStateAtom(backend)),
        sessionRoster: normalizeSessionRoster(listResult),
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
      if (!(arg.sessionId in snapshot.sessions) || snapshot.sessions[arg.sessionId].status !== 'inactive') {
        return;
      }

      yield* deleteSession(agent, arg.sessionId);

      const { [arg.sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
      const selectedSessionId = snapshot.selectedSessionId === arg.sessionId ? undefined : snapshot.selectedSessionId;

      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        selectedSessionId,
        sessions: remainingSessions,
      });

      const listResult = yield* listSessions(agent);
      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        sessionRoster: normalizeSessionRoster(listResult),
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
      const agent = getAgentHandle(arg.backend);

      if (trimmed.length === 0 || session?.status !== 'active' || agent === undefined) {
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

      yield* sendPrompt(agent, session.sessionId, trimmed);
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

export const setModeFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; modeId: string }, get) =>
    Effect.gen(function* () {
      const snapshot = get(backendStateAtom(arg.backend));
      const session = selectedSessionSnapshot(snapshot);
      const agent = getAgentHandle(arg.backend);

      if (session?.status !== 'active' || agent === undefined) {
        return;
      }

      yield* setMode(agent, session.sessionId, arg.modeId);
      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          selectedModeId: arg.modeId,
        })),
      });
    }),
  )
  .pipe(Atom.keepAlive);

export const setModelFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; modelId: string }, get) =>
    Effect.gen(function* () {
      const snapshot = get(backendStateAtom(arg.backend));
      const session = selectedSessionSnapshot(snapshot);
      const agent = getAgentHandle(arg.backend);

      if (session?.status !== 'active' || agent === undefined) {
        return;
      }

      yield* setConfigOption(agent, session.sessionId, 'model', arg.modelId);
      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          selectedModelId: arg.modelId,
        })),
      });
    }),
  )
  .pipe(Atom.keepAlive);

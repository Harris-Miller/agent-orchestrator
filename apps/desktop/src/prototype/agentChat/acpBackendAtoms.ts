/** Effect Atom state for parallel ACP backend harnesses. */
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';

import {
  ALL_ACP_BACKENDS,
  backendLabel,
  initialBackendSnapshot,
  normalizeModels,
  normalizeModes,
} from './acpSessionBootstrap.ts';
import type { BackendSnapshot } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';
import {
  appendBackendUserChatItem,
  getAgentSessionHandle,
  resetBackendHarnessState,
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

export const allBackendPhasesAtom = Atom.make(get =>
  ALL_ACP_BACKENDS.map(backend => ({
    backend,
    error: get(backendStateAtom(backend)).error,
    label: backendLabel(backend),
    phase: get(backendStateAtom(backend)).phase,
  })),
).pipe(Atom.keepAlive);

export const backendHarnessAtom = Atom.family((backend: AcpAgentBackend) =>
  acpRuntime
    .atom(get => {
      const updateState = (patch: (current: BackendSnapshot) => BackendSnapshot) => {
        get.registry.update(backendStateAtom(backend), patch);
      };

      return runBackendHarness(backend, {
        onChatItems: chatItems => {
          updateState(current => ({ ...current, chatItems }));
        },
        onCommandsReady: availableCommands => {
          updateState(current => ({
            ...current,
            availableCommands,
            phase: 'ready',
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
        onSessionNewResult: (sessionNewResult, sessionId) => {
          const modes = normalizeModes(sessionNewResult);
          const models = normalizeModels(sessionNewResult);
          updateState(current => ({
            ...current,
            phase: 'session_open',
            selectedModeId: modes.currentId,
            selectedModelId: models.currentId,
            sessionId,
            sessionNewResult,
          }));
        },
      });
    })
    .pipe(Atom.keepAlive),
);

export const sendChatItemFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; text: string }, get) =>
    Effect.gen(function* () {
      const trimmed = arg.text.trim();
      const handle = getAgentSessionHandle(arg.backend);
      if (trimmed.length === 0 || handle === undefined) {
        return;
      }

      const chatItems = appendBackendUserChatItem(arg.backend, trimmed);
      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        chatItems,
      });

      yield* sendPrompt(handle.agent, handle.sessionId, trimmed);
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
      const handle = getAgentSessionHandle(arg.backend);
      if (handle === undefined) {
        return;
      }

      yield* setMode(handle.agent, handle.sessionId, arg.modeId);
      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        selectedModeId: arg.modeId,
      });
    }),
  )
  .pipe(Atom.keepAlive);

export const setModelFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; modelId: string }, get) =>
    Effect.gen(function* () {
      const handle = getAgentSessionHandle(arg.backend);
      if (handle === undefined) {
        return;
      }

      yield* setConfigOption(handle.agent, handle.sessionId, 'model', arg.modelId);
      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        selectedModelId: arg.modelId,
      });
    }),
  )
  .pipe(Atom.keepAlive);

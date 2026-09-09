/**
 * PROTOTYPE — throwaway harness wiring ACP agents through connectAcpAgent.
 * Backends: Codex/Claude via Tauri adapter resources, gemini-cli (PATH).
 */
import { OS } from '@lib/context-services';
import { ClientRpcs, connectAcpAgent } from '@libs/effect-acp';
import type {
  AcpAgentConnection,
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';
import { Effect, Exit, Ref } from 'effect';
import type { Tracer } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';
import { isRecord } from '../../utils.ts';

import type { MissingLaunchPrerequisite } from './acpAdapterCommand.ts';
import { makeAcpAdapterCommand } from './acpAdapterCommand.ts';
import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import { sessionIdFromElicitationRequest } from './pendingInteractions.ts';
import { clearPromptSpan, clearPromptSpansForBackend, getPromptSpan, setPromptSpan } from './promptSpanRegistry.ts';
import type { AvailableCommand, ChatItem, SessionUsage } from './sessionUpdateReducer.ts';
import {
  appendUserChatMessage,
  chatItemsFromAccumulator,
  emptyChatAccumulator,
  parseAvailableCommands,
  parseUsageUpdate,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';

export type AcpAgentBackend = 'claude-agent-acp' | 'codex-acp' | 'gemini-cli';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};

const makeAgentCommand = Effect.fn('makeAgentCommand')(function* (backend: AcpAgentBackend) {
  switch (backend) {
    case 'claude-agent-acp':
    case 'codex-acp':
      return yield* makeAcpAdapterCommand(backend);
    case 'gemini-cli':
      return ChildProcess.make('gemini', ['--acp'], pipedSpawnOptions);
  }
});

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
};

export type AgentHandle = AcpAgentConnection['agent'];

export type BackendHarnessCallbacks = {
  readonly onCommandsReady: (sessionId: string, commands: readonly AvailableCommand[]) => void;
  readonly onElicitationCreate: (
    sessionId: string,
    request: CreateElicitationRequestBody,
    resolve: (response: CreateElicitationResponseBody) => void,
  ) => void;
  readonly onInitializeResult: (result: unknown) => void;
  readonly onPermissionRequest: (
    sessionId: string,
    request: RequestPermissionRequest,
    resolve: (response: RequestPermissionResponse) => void,
  ) => void;
  readonly onPhase: (phase: AcpBootstrapPhase, error?: string) => void;
  readonly onRpcMessage: (direction: RpcWireEntry['direction'], message: unknown) => void;
  readonly onSessionRosterResult: (result: unknown) => void;
  readonly onSessionUpdate: (sessionId: string, chatItems: readonly ChatItem[], update: unknown) => void;
  readonly onUsageUpdate: (sessionId: string, usage: SessionUsage) => void;
};

const agentHandles = new Map<AcpAgentBackend, AgentHandle>();
const chatAccumulators = new Map<AcpAgentBackend, Map<string, ReturnType<typeof emptyChatAccumulator>>>();
const stoppedRefs = new Map<AcpAgentBackend, Ref.Ref<boolean>>();

const getStoppedRef = (backend: AcpAgentBackend): Ref.Ref<boolean> => {
  const existing = stoppedRefs.get(backend);
  if (existing !== undefined) {
    return existing;
  }

  const created = Ref.makeUnsafe(false);
  stoppedRefs.set(backend, created);
  return created;
};

const getSessionAccumulators = (backend: AcpAgentBackend): Map<string, ReturnType<typeof emptyChatAccumulator>> => {
  const existing = chatAccumulators.get(backend);
  if (existing !== undefined) {
    return existing;
  }

  const created = new Map<string, ReturnType<typeof emptyChatAccumulator>>();
  chatAccumulators.set(backend, created);
  return created;
};

export const getAgentHandle = (backend: AcpAgentBackend): AgentHandle | undefined => agentHandles.get(backend);

export const resetBackendHarnessState = (backend: AcpAgentBackend): void => {
  agentHandles.delete(backend);
  chatAccumulators.set(backend, new Map());
  clearPromptSpansForBackend(backend);
};

export const appendBackendUserChatItem = (
  backend: AcpAgentBackend,
  sessionId: string,
  text: string,
): readonly ChatItem[] => {
  const sessionAccumulators = getSessionAccumulators(backend);
  const accumulator = sessionAccumulators.get(sessionId) ?? emptyChatAccumulator();
  const next = appendUserChatMessage(accumulator, text);
  sessionAccumulators.set(sessionId, next);
  return chatItemsFromAccumulator(next);
};

const reduceBackendSessionUpdate = (
  backend: AcpAgentBackend,
  sessionId: string,
  update: unknown,
): readonly ChatItem[] => {
  const sessionAccumulators = getSessionAccumulators(backend);
  const accumulator = sessionAccumulators.get(sessionId) ?? emptyChatAccumulator();
  const next = reduceSessionUpdate(accumulator, update);
  sessionAccumulators.set(sessionId, next);
  return chatItemsFromAccumulator(next);
};

const withTurnCorrelatedSpan = <A, E, R>(
  name: string,
  backend: AcpAgentBackend,
  sessionId: string | undefined,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const parent: Tracer.AnySpan | undefined = sessionId !== undefined ? getPromptSpan(backend, sessionId) : undefined;
  return effect.pipe(Effect.withSpan(name, parent !== undefined ? { parent } : { root: true }));
};

const makeClientHandlers = (
  backend: AcpAgentBackend,
  onSessionUpdate: (sessionId: string, update: unknown) => void,
  onElicitationCreate: BackendHarnessCallbacks['onElicitationCreate'],
  onPermissionRequest: BackendHarnessCallbacks['onPermissionRequest'],
) =>
  ClientRpcs.toLayer(
    Effect.succeed({
      'elicitation/complete': () => Effect.void,
      'elicitation/create': (request: CreateElicitationRequestBody) => {
        const sessionId = sessionIdFromElicitationRequest(request);
        return withTurnCorrelatedSpan(
          'elicitation/create',
          backend,
          sessionId,
          Effect.gen(function* () {
            if (sessionId === undefined) {
              yield* Effect.logWarning('elicitation/create missing session id; cancelling');
              return { action: 'cancel' as const };
            }
            yield* Effect.logInfo('elicitation/create awaiting UI', sessionId);
            return yield* Effect.promise(
              () =>
                new Promise<CreateElicitationResponseBody>(resolve => {
                  onElicitationCreate(sessionId, request, resolve);
                }),
            );
          }),
        );
      },
      'fs/read_text_file': () => Effect.succeed({ content: '' }),
      'fs/write_text_file': () => Effect.succeed({}),
      'session/request_permission': (request: RequestPermissionRequest) =>
        withTurnCorrelatedSpan(
          'session/request_permission',
          backend,
          request.sessionId,
          Effect.gen(function* () {
            yield* Effect.logInfo('session/request_permission awaiting UI', request.sessionId);
            return yield* Effect.promise(
              () =>
                new Promise<RequestPermissionResponse>(resolve => {
                  onPermissionRequest(request.sessionId, request, resolve);
                }),
            );
          }),
        ),
      'session/update': payload =>
        withTurnCorrelatedSpan(
          'session/update',
          backend,
          payload.sessionId,
          Effect.sync(() => {
            onSessionUpdate(payload.sessionId, payload.update);
          }),
        ),
      'terminal/create': () => Effect.succeed({ terminalId: 'prototype-terminal' }),
      'terminal/kill': () => Effect.succeed({}),
      'terminal/output': () => Effect.succeed({ output: '', truncated: false }),
      'terminal/release': () => Effect.succeed({}),
      'terminal/wait_for_exit': () => Effect.succeed({ exitCode: 0, signal: null }),
    }),
  );

const MAX_CONNECT_ATTEMPTS = 3;

/** Connect + initialize + roster list through ready. Does not hold the connection open. */
const bootstrapOnce = Effect.fn('bootstrapOnce', { root: true })(
  function* (backend: AcpAgentBackend, handlers: BackendHarnessCallbacks, onReady: () => void) {
    yield* Effect.annotateCurrentSpan({
      'acp.agent': backend,
    });
    yield* Effect.logInfo('ACP harness connecting', backend);
    handlers.onPhase('connecting');
    chatAccumulators.set(backend, new Map());
    clearPromptSpansForBackend(backend);

    const command = yield* makeAgentCommand(backend);
    const connection = yield* connectAcpAgent(
      command,
      makeClientHandlers(
        backend,
        (sessionId, update) => {
          const chatItems = reduceBackendSessionUpdate(backend, sessionId, update);
          handlers.onSessionUpdate(sessionId, chatItems, update);

          if (isRecord(update) && update.sessionUpdate === 'available_commands_update') {
            const commands = parseAvailableCommands(update.availableCommands);
            handlers.onCommandsReady(sessionId, commands);
          }

          const usage = parseUsageUpdate(update);
          if (usage !== undefined) {
            handlers.onUsageUpdate(sessionId, usage);
          }
        },
        handlers.onElicitationCreate,
        handlers.onPermissionRequest,
      ),
      {
        wireTap: {
          onMessage: handlers.onRpcMessage,
        },
      },
    );

    const { agent } = connection;
    agentHandles.set(backend, agent);
    yield* Effect.logInfo('ACP harness connected', backend, { pid: connection.handle.pid });

    const initializeResult = yield* agent.initialize({
      clientCapabilities: { elicitation: { form: {} } },
      protocolVersion: 1,
    });
    handlers.onInitializeResult(initializeResult);
    handlers.onPhase('initialized');
    yield* Effect.logInfo('ACP harness initialized', backend);

    const listResult = yield* agent['session/list']({});
    handlers.onSessionRosterResult(listResult);
    handlers.onPhase('ready');
    yield* Effect.logInfo('ACP harness ready', backend);
    onReady();
  },
  (effect, backend) => effect.pipe(Effect.annotateLogs({ backend, module: 'agentHarness' })),
);

/** Spawns an ACP agent, bootstraps a session, and blocks until interrupted. Retries up to 3 times on failure. */
export const runBackendHarness = Effect.fnUntraced(
  function* (backend: AcpAgentBackend, handlers: BackendHarnessCallbacks) {
    const stoppedRef = getStoppedRef(backend);
    yield* Ref.set(stoppedRef, false);
    const consecutiveFailures = { count: 0 };
    yield* Effect.logInfo('ACP harness started', backend);

    while (!(yield* Ref.get(stoppedRef))) {
      const exit = yield* Effect.exit(
        bootstrapOnce(backend, handlers, () => {
          consecutiveFailures.count = 0;
        }).pipe(
          Effect.andThen(Effect.never),
          Effect.scoped,
          Effect.catchTag('MissingLaunchPrerequisite', (error: MissingLaunchPrerequisite) =>
            Effect.gen(function* () {
              yield* Effect.logError('ACP harness missing launch prerequisite', backend, error.message);
              handlers.onPhase('error', error.message);
            }),
          ),
        ),
      );
      if (Exit.isSuccess(exit)) {
        // MissingLaunchPrerequisite is terminal until Restart; Effect.never never succeeds.
        return;
      }

      const errorMessage = Exit.isFailure(exit) ? formatError(exit.cause) : 'Unknown error';
      yield* Effect.logError('ACP harness bootstrap failed', backend, errorMessage);
      handlers.onPhase('error', errorMessage);
      if (yield* Ref.get(stoppedRef)) {
        yield* Effect.logInfo('ACP harness stopped after failure', backend);
        return;
      }

      consecutiveFailures.count += 1;
      if (consecutiveFailures.count >= MAX_CONNECT_ATTEMPTS) {
        yield* Effect.logFatal('ACP harness exhausted connect retries', backend, {
          attempts: consecutiveFailures.count,
        });
        return;
      }

      yield* Effect.logWarning('ACP harness retrying connect', backend, {
        attempt: consecutiveFailures.count,
        maxAttempts: MAX_CONNECT_ATTEMPTS,
      });
      agentHandles.delete(backend);
      clearPromptSpansForBackend(backend);
      yield* Effect.sleep('1 second');
    }
  },
  Effect.scoped,
  Effect.provide(TauriServicesLive),
  (effect, backend) => effect.pipe(Effect.annotateLogs({ backend, module: 'agentHarness' })),
);

export const stopBackendHarness = Effect.fn('stopBackendHarness')(function* (backend: AcpAgentBackend) {
  yield* Effect.logInfo('Stopping ACP harness', backend);
  yield* Ref.set(getStoppedRef(backend), true);
  agentHandles.delete(backend);
  clearPromptSpansForBackend(backend);
});

const sessionCwd = () =>
  Effect.gen(function* () {
    const os = yield* OS;
    return os.cwd();
  }).pipe(Effect.provide(TauriServicesLive));

export const listSessions = Effect.fn('listSessions')(
  function* (agent: AgentHandle) {
    return yield* agent['session/list']({});
  },
  Effect.tap(() => Effect.logDebug('session/list ok')),
  Effect.tapError(error => Effect.logError('session/list failed', error)),
  Effect.provide(TauriServicesLive),
);

export const createSession = Effect.fn('createSession')(
  function* (agent: AgentHandle, cwd: string) {
    yield* Effect.logInfo('Creating ACP session', { cwd });
    const result = yield* agent['session/new']({ cwd, mcpServers: [] });
    yield* Effect.logInfo('Created ACP session', { sessionId: result.sessionId });
    return { cwd, result };
  },
  Effect.tapError(error => Effect.logError('session/new failed', error)),
);

export const loadSession = Effect.fn('loadSession')(
  function* (agent: AgentHandle, sessionId: string) {
    yield* Effect.logInfo('Loading ACP session', sessionId);
    const cwd = yield* sessionCwd();
    return yield* agent['session/load']({ cwd, mcpServers: [], sessionId });
  },
  (effect, _agent, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/load failed', sessionId, error))),
);

export const resumeSession = Effect.fn('resumeSession')(
  function* (agent: AgentHandle, sessionId: string) {
    yield* Effect.logInfo('Resuming ACP session', sessionId);
    const cwd = yield* sessionCwd();
    return yield* agent['session/resume']({ cwd, sessionId });
  },
  (effect, _agent, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/resume failed', sessionId, error))),
);

export const closeSession = Effect.fn('closeSession')(
  function* (agent: AgentHandle, sessionId: string) {
    yield* Effect.logInfo('Closing ACP session', sessionId);
    yield* agent['session/close']({ sessionId });
  },
  (effect, _agent, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/close failed', sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const deleteSession = Effect.fn('deleteSession')(
  function* (agent: AgentHandle, sessionId: string) {
    yield* Effect.logInfo('Deleting ACP session', sessionId);
    yield* agent['session/delete']({ sessionId });
  },
  (effect, _agent, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/delete failed', sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const sendPrompt = Effect.fn('sendPrompt')(
  function* (backend: AcpAgentBackend, agent: AgentHandle, sessionId: string, text: string) {
    yield* Effect.annotateCurrentSpan({
      'acp.agent': backend,
      'acp.sessionId': sessionId,
    });
    const span = yield* Effect.currentSpan;
    setPromptSpan(backend, sessionId, span);
    yield* Effect.logDebug('session/prompt', sessionId, { chars: text.length });
    yield* agent['session/prompt']({
      prompt: [{ text, type: 'text' }],
      sessionId,
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          clearPromptSpan(backend, sessionId);
        }),
      ),
    );
  },
  (effect, backend, _agent, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/prompt failed', backend, sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const setConfigOption = Effect.fn('setConfigOption')(
  function* (agent: AgentHandle, sessionId: string, configId: string, value: string) {
    yield* Effect.logDebug('session/set_config_option', sessionId, configId, value);
    return yield* agent['session/set_config_option']({
      configId,
      sessionId,
      value,
    });
  },
  (effect, _agent, sessionId, configId) =>
    effect.pipe(
      Effect.tapError(error => Effect.logError('session/set_config_option failed', sessionId, configId, error)),
    ),
  Effect.provide(TauriServicesLive),
);

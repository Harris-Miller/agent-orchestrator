/**
 * Backend harness lifecycle: spawn, connect, bootstrap retry, chat accumulators.
 * `requireConnectedAgent` is for sessionRpc only — atoms must not import it.
 */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { connectAcpAgent } from '@libs/effect-acp';
import type {
  AcpAgentConnection,
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';
import { Effect, Exit, Ref, Schema } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import { isRecord } from '../utils.ts';

import type { MissingLaunchPrerequisite } from './acpAdapterCommand.ts';
import { makeAcpAdapterCommand } from './acpAdapterCommand.ts';
import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { makeClientHandlers } from './clientHandlers.ts';
import { clearPromptSpansForLaunchTarget } from './promptSpanRegistry.ts';
import type { AvailableCommand, ChatItem, SessionUsage } from './sessionUpdateReducer.ts';
import {
  appendUserChatMessage,
  chatItemsFromAccumulator,
  emptyChatAccumulator,
  parseAvailableCommands,
  parseUsageUpdate,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';

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

const makeAgentCommand = Effect.fn('makeAgentCommand')(function* (backend: AgentLaunchTarget) {
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

type AgentHandle = AcpAgentConnection['agent'];

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

export class BackendNotConnected extends Schema.TaggedError<BackendNotConnected>()('BackendNotConnected', {
  backend: Schema.String,
}) {}

const agentHandles = new Map<AgentLaunchTarget, AgentHandle>();
const chatAccumulators = new Map<AgentLaunchTarget, Map<string, ReturnType<typeof emptyChatAccumulator>>>();
const stoppedRefs = new Map<AgentLaunchTarget, Ref.Ref<boolean>>();

const getStoppedRef = (backend: AgentLaunchTarget): Ref.Ref<boolean> => {
  const existing = stoppedRefs.get(backend);
  if (existing !== undefined) {
    return existing;
  }

  const created = Ref.makeUnsafe(false);
  stoppedRefs.set(backend, created);
  return created;
};

const getSessionAccumulators = (backend: AgentLaunchTarget): Map<string, ReturnType<typeof emptyChatAccumulator>> => {
  const existing = chatAccumulators.get(backend);
  if (existing !== undefined) {
    return existing;
  }

  const created = new Map<string, ReturnType<typeof emptyChatAccumulator>>();
  chatAccumulators.set(backend, created);
  return created;
};

/** For sessionRpc only — atoms must not import this. */
export const requireConnectedAgent = (backend: AgentLaunchTarget): Effect.Effect<AgentHandle, BackendNotConnected> => {
  const agent = agentHandles.get(backend);
  if (agent === undefined) {
    return Effect.fail(new BackendNotConnected({ backend }));
  }
  return Effect.succeed(agent);
};

export const resetBackendHarnessState = (backend: AgentLaunchTarget): void => {
  agentHandles.delete(backend);
  chatAccumulators.set(backend, new Map());
  clearPromptSpansForLaunchTarget(backend);
};

export const appendBackendUserChatItem = (
  backend: AgentLaunchTarget,
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
  backend: AgentLaunchTarget,
  sessionId: string,
  update: unknown,
): readonly ChatItem[] => {
  const sessionAccumulators = getSessionAccumulators(backend);
  const accumulator = sessionAccumulators.get(sessionId) ?? emptyChatAccumulator();
  const next = reduceSessionUpdate(accumulator, update);
  sessionAccumulators.set(sessionId, next);
  return chatItemsFromAccumulator(next);
};

const MAX_CONNECT_ATTEMPTS = 3;

/** Connect + initialize + roster list through ready. Does not hold the connection open. */
const bootstrapOnce = Effect.fn('bootstrapOnce', { root: true })(
  function* (backend: AgentLaunchTarget, handlers: BackendHarnessCallbacks, onReady: () => void) {
    yield* Effect.annotateCurrentSpan({
      'acp.agent': backend,
    });
    yield* Effect.logInfo('ACP harness connecting', backend);
    handlers.onPhase('connecting');
    chatAccumulators.set(backend, new Map());
    clearPromptSpansForLaunchTarget(backend);

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
  (effect, backend) => effect.pipe(Effect.annotateLogs({ backend, module: 'backendHarness' })),
);

/** Spawns an ACP agent, bootstraps a session, and blocks until interrupted. Retries up to 3 times on failure. */
export const runBackendHarness = Effect.fnUntraced(
  function* (backend: AgentLaunchTarget, handlers: BackendHarnessCallbacks) {
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
      clearPromptSpansForLaunchTarget(backend);
      yield* Effect.sleep('1 second');
    }
  },
  Effect.scoped,
  Effect.provide(TauriServicesLive),
  (effect, backend) => effect.pipe(Effect.annotateLogs({ backend, module: 'backendHarness' })),
);

export const stopBackendHarness = Effect.fn('stopBackendHarness')(function* (backend: AgentLaunchTarget) {
  yield* Effect.logInfo('Stopping ACP harness', backend);
  yield* Ref.set(getStoppedRef(backend), true);
  agentHandles.delete(backend);
  clearPromptSpansForLaunchTarget(backend);
});

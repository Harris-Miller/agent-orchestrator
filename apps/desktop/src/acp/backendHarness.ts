/**
 * Backend harness lifecycle: spawn, connect, bootstrap retry.
 * Live agent handles are registered with sessionRpc; atoms never see them.
 * Session transcript is owned by SessionSnapshot (atoms fold session/update).
 */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { connectAcpAgent } from '@libs/effect-acp';
import type {
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';
import { Effect, Exit, Ref } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

import { isRecord } from '../utils.ts';

import type { MissingLaunchPrerequisite } from './acpAdapterCommand.ts';
import { makeAcpAdapterCommand } from './acpAdapterCommand.ts';
import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { makeClientHandlers } from './clientHandlers.ts';
import { clearPromptSpansForLaunchTarget } from './promptSpanRegistry.ts';
import { clearConnectedAgent, setConnectedAgent } from './sessionRpc.ts';
import type { AvailableCommand, SessionUsage } from './sessionUpdateReducer.ts';
import { parseAvailableCommands, parseUsageUpdate } from './sessionUpdateReducer.ts';

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

const makeAgentCommand = Effect.fn('makeAgentCommand')(function* (launchTarget: AgentLaunchTarget) {
  switch (launchTarget) {
    case 'claude-agent-acp':
    case 'codex-acp':
      return yield* makeAcpAdapterCommand(launchTarget);
    case 'gemini-cli':
      return ChildProcess.make('gemini', ['--acp'], pipedSpawnOptions);
  }
});

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
};

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
  readonly onSessionUpdate: (sessionId: string, update: unknown) => void;
  readonly onUsageUpdate: (sessionId: string, usage: SessionUsage) => void;
};

const stoppedRefs = new Map<AgentLaunchTarget, Ref.Ref<boolean>>();

const getStoppedRef = (launchTarget: AgentLaunchTarget): Ref.Ref<boolean> => {
  const existing = stoppedRefs.get(launchTarget);
  if (existing !== undefined) {
    return existing;
  }

  const created = Ref.makeUnsafe(false);
  stoppedRefs.set(launchTarget, created);
  return created;
};

export const resetBackendHarnessState = (launchTarget: AgentLaunchTarget): void => {
  clearConnectedAgent(launchTarget);
  clearPromptSpansForLaunchTarget(launchTarget);
};

const MAX_CONNECT_ATTEMPTS = 3;

/** Connect + initialize + roster list through ready. Does not hold the connection open. */
const bootstrapOnce = Effect.fn('bootstrapOnce', { root: true })(
  function* (launchTarget: AgentLaunchTarget, handlers: BackendHarnessCallbacks, onReady: () => void) {
    yield* Effect.annotateCurrentSpan({
      'acp.agent': launchTarget,
    });
    yield* Effect.logInfo('ACP harness connecting', launchTarget);
    handlers.onPhase('connecting');
    clearPromptSpansForLaunchTarget(launchTarget);

    const command = yield* makeAgentCommand(launchTarget);
    const connection = yield* connectAcpAgent(
      command,
      makeClientHandlers(
        launchTarget,
        (sessionId, update) => {
          handlers.onSessionUpdate(sessionId, update);

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
    setConnectedAgent(launchTarget, agent);
    yield* Effect.logInfo('ACP harness connected', launchTarget, { pid: connection.handle.pid });

    const initializeResult = yield* agent.initialize({
      clientCapabilities: { elicitation: { form: {} } },
      protocolVersion: 1,
    });
    handlers.onInitializeResult(initializeResult);
    handlers.onPhase('initialized');
    yield* Effect.logInfo('ACP harness initialized', launchTarget);

    const listResult = yield* agent['session/list']({});
    handlers.onSessionRosterResult(listResult);
    handlers.onPhase('ready');
    yield* Effect.logInfo('ACP harness ready', launchTarget);
    onReady();
  },
  (effect, launchTarget) => effect.pipe(Effect.annotateLogs({ launchTarget, module: 'backendHarness' })),
);

/** Spawns an ACP agent, bootstraps a session, and blocks until interrupted. Retries up to 3 times on failure. */
export const runBackendHarness = Effect.fnUntraced(
  function* (launchTarget: AgentLaunchTarget, handlers: BackendHarnessCallbacks) {
    const stoppedRef = getStoppedRef(launchTarget);
    yield* Ref.set(stoppedRef, false);
    const consecutiveFailures = { count: 0 };
    yield* Effect.logInfo('ACP harness started', launchTarget);

    while (!(yield* Ref.get(stoppedRef))) {
      const exit = yield* Effect.exit(
        bootstrapOnce(launchTarget, handlers, () => {
          consecutiveFailures.count = 0;
        }).pipe(
          Effect.andThen(Effect.never),
          Effect.scoped,
          Effect.catchTag('MissingLaunchPrerequisite', (error: MissingLaunchPrerequisite) =>
            Effect.gen(function* () {
              yield* Effect.logError('ACP harness missing launch prerequisite', launchTarget, error.message);
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
      yield* Effect.logError('ACP harness bootstrap failed', launchTarget, errorMessage);
      handlers.onPhase('error', errorMessage);
      if (yield* Ref.get(stoppedRef)) {
        yield* Effect.logInfo('ACP harness stopped after failure', launchTarget);
        return;
      }

      consecutiveFailures.count += 1;
      if (consecutiveFailures.count >= MAX_CONNECT_ATTEMPTS) {
        yield* Effect.logFatal('ACP harness exhausted connect retries', launchTarget, {
          attempts: consecutiveFailures.count,
        });
        return;
      }

      yield* Effect.logWarning('ACP harness retrying connect', launchTarget, {
        attempt: consecutiveFailures.count,
        maxAttempts: MAX_CONNECT_ATTEMPTS,
      });
      clearConnectedAgent(launchTarget);
      clearPromptSpansForLaunchTarget(launchTarget);
      yield* Effect.sleep('1 second');
    }
  },
  Effect.scoped,
  Effect.provide(TauriServicesLive),
  (effect, launchTarget) => effect.pipe(Effect.annotateLogs({ launchTarget, module: 'backendHarness' })),
);

export const stopBackendHarness = Effect.fn('stopBackendHarness')(function* (launchTarget: AgentLaunchTarget) {
  yield* Effect.logInfo('Stopping ACP harness', launchTarget);
  yield* Ref.set(getStoppedRef(launchTarget), true);
  clearConnectedAgent(launchTarget);
  clearPromptSpansForLaunchTarget(launchTarget);
});

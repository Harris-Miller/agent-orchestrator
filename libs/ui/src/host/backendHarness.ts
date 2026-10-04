/**
 * Backend harness lifecycle: spawn, connect, bootstrap retry.
 * Live agent handles are registered with sessionRpc; atoms never see them.
 * Inbound session/update is forwarded whole; Session update apply owns demux.
 */
import { connectAcpAgent } from '@libs/effect-acp';
import type {
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';
import { Effect, Exit, Ref } from 'effect';

import { makeAcpAdapterCommand } from './acpAdapterCommand.ts';
import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { makeClientHandlers } from './clientHandlers.ts';
import type { ConfigOptionIndex } from './configProbe.ts';
import { runConfigProbe } from './configProbe.ts';
import type { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';
import { clearPromptSpansForLaunchTarget } from './promptSpanRegistry.ts';
import type { SessionListScope } from './sessionListScope.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import { clearConnectedAgent, setConnectedAgent } from './sessionRpc.ts';

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};

const makeAgentCommand = Effect.fn('makeAgentCommand')(function* (launchTarget: AgentLaunchTarget) {
  return yield* makeAcpAdapterCommand(launchTarget);
});

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
  readonly receivedAt: number;
};

export type BackendHarnessCallbacks = {
  readonly onConfigOptionIndexClear: () => void;
  readonly onConfigOptionIndexPublish: (index: ConfigOptionIndex) => void;
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

/** Connect + initialize + Config probe + buffered roster list through ready. Does not hold the connection open. */
const bootstrapOnce = Effect.fn('bootstrapOnce', { root: true })(
  function* (
    launchTarget: AgentLaunchTarget,
    handlers: BackendHarnessCallbacks,
    resolveListScope: () => SessionListScope,
    onReady: () => void,
  ) {
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
        handlers.onSessionUpdate,
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
    setConnectedAgent(launchTarget, connection);
    yield* Effect.logInfo('ACP harness connected', launchTarget, { pid: connection.handle.pid });

    const initializeResult = yield* agent.initialize({
      clientCapabilities: {
        elicitation: { form: {} },
        session: { configOptions: { boolean: {} } },
      },
      protocolVersion: 1,
    });
    handlers.onInitializeResult(initializeResult);
    handlers.onPhase('initialized');
    yield* Effect.logInfo('ACP harness initialized', launchTarget);

    handlers.onPhase('probing');
    handlers.onConfigOptionIndexClear();
    yield* Effect.logInfo('ACP harness probing', launchTarget);

    const listPayload = listSessionsPayload(resolveListScope());
    const listResult = listPayload === undefined ? { sessions: [] } : yield* agent['session/list'](listPayload);
    const index = yield* runConfigProbe(agent);
    handlers.onConfigOptionIndexPublish(index);
    handlers.onSessionRosterResult(listResult);
    handlers.onPhase('ready');
    yield* Effect.logInfo('ACP harness ready', launchTarget);
    onReady();
  },
  (effect, launchTarget) => effect.pipe(Effect.annotateLogs({ launchTarget, module: 'backendHarness' })),
);

/** Spawns an ACP agent, bootstraps a session, and blocks until interrupted. Retries up to 3 times on failure. */
export const runBackendHarness = Effect.fnUntraced(
  function* (
    launchTarget: AgentLaunchTarget,
    handlers: BackendHarnessCallbacks,
    resolveListScope: () => SessionListScope,
  ) {
    const stoppedRef = getStoppedRef(launchTarget);
    yield* Ref.set(stoppedRef, false);
    const consecutiveFailures = { count: 0 };
    yield* Effect.logInfo('ACP harness started', launchTarget);

    while (!(yield* Ref.get(stoppedRef))) {
      const exit = yield* Effect.exit(
        bootstrapOnce(launchTarget, handlers, resolveListScope, () => {
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
  (effect, launchTarget) => effect.pipe(Effect.annotateLogs({ launchTarget, module: 'backendHarness' })),
);

export const stopBackendHarness = Effect.fn('stopBackendHarness')(function* (launchTarget: AgentLaunchTarget) {
  yield* Effect.logInfo('Stopping ACP harness', launchTarget);
  yield* Ref.set(getStoppedRef(launchTarget), true);
  clearConnectedAgent(launchTarget);
  clearPromptSpansForLaunchTarget(launchTarget);
});

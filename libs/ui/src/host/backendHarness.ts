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

import { makeAcpLaunchCommand } from './acpLaunchCommand.ts';
import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { airCapability, airMeta } from './airMeta.ts';
import {
  ANTIGRAVITY_NOT_SIGNED_IN,
  ANTIGRAVITY_OAUTH_PERSONAL,
  ANTIGRAVITY_SIGN_IN_TIMEOUT,
  AntigravitySignInTimedOut,
  consumeAntigravityAuthStderr,
  formatBootstrapError,
} from './antigravityAuth.ts';
import { makeClientHandlers } from './clientHandlers.ts';
import type { ConfigOptionIndex } from './configProbe.ts';
import { runConfigProbe } from './configProbe.ts';
import type { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';
import { clearPromptSpansForLaunchTarget } from './promptSpanRegistry.ts';
import type { SessionListScope } from './sessionListScope.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import { clearConnectedAgent, setConnectedAgent } from './sessionRpc.ts';

export { ANTIGRAVITY_NOT_SIGNED_IN, AntigravitySignInTimedOut };

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
  readonly receivedAt: number;
};

export type BackendHarnessCallbacks = {
  readonly onAntigravityAuthUrl?: (url: string) => void;
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
const pendingSignInRefs = new Map<AgentLaunchTarget, Ref.Ref<boolean>>();

const getOrCreateBoolRef = (
  map: Map<AgentLaunchTarget, Ref.Ref<boolean>>,
  launchTarget: AgentLaunchTarget,
): Ref.Ref<boolean> => {
  const existing = map.get(launchTarget);
  if (existing !== undefined) {
    return existing;
  }
  const created = Ref.makeUnsafe(false);
  map.set(launchTarget, created);
  return created;
};

export const resetBackendHarnessState = (launchTarget: AgentLaunchTarget): void => {
  clearConnectedAgent(launchTarget);
  clearPromptSpansForLaunchTarget(launchTarget);
};

/** Mark Antigravity harness to run Sign in (`authenticate`) on the next bootstrap. */
export const requestAntigravitySignIn = Effect.fn('requestAntigravitySignIn')(function* () {
  yield* Ref.set(getOrCreateBoolRef(pendingSignInRefs, 'antigravity-acp'), true);
});

const MAX_CONNECT_ATTEMPTS = 3;

/** Connect + initialize + optional Sign in + Config probe + buffered roster list through ready. */
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

    const command = yield* makeAcpLaunchCommand(launchTarget);
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
        ...(launchTarget === 'claude-agent-acp' || launchTarget === 'codex-acp'
          ? {
              _meta: airMeta({ capabilities: [airCapability.sessionIndex] }),
            }
          : {}),
        elicitation: { form: {} },
        session: { configOptions: { boolean: {} } },
      },
      protocolVersion: 1,
    });
    handlers.onInitializeResult(initializeResult);
    handlers.onPhase('initialized');
    yield* Effect.logInfo('ACP harness initialized', launchTarget);

    const pendingSignIn =
      launchTarget === 'antigravity-acp' &&
      (yield* Ref.getAndSet(getOrCreateBoolRef(pendingSignInRefs, launchTarget), false));
    if (pendingSignIn) {
      handlers.onPhase('signing-in');
      yield* Effect.logInfo('ACP harness Antigravity Sign in', launchTarget);
      yield* Effect.forkScoped(
        consumeAntigravityAuthStderr(connection.handle.stderr, handlers.onAntigravityAuthUrl).pipe(
          Effect.catchCause(cause => Effect.logWarning('Antigravity stderr auth consumer stopped', cause)),
        ),
      );
      yield* agent.authenticate({ methodId: ANTIGRAVITY_OAUTH_PERSONAL }).pipe(
        Effect.timeoutOrElse({
          duration: ANTIGRAVITY_SIGN_IN_TIMEOUT,
          orElse: () => Effect.fail(new AntigravitySignInTimedOut({ message: 'Antigravity Sign in timed out' })),
        }),
      );
      yield* Effect.logInfo('ACP harness Antigravity Sign in complete', launchTarget);
    }

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
    const stoppedRef = getOrCreateBoolRef(stoppedRefs, launchTarget);
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

      const errorMessage = Exit.isFailure(exit) ? formatBootstrapError(launchTarget, exit.cause) : 'Unknown error';
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
  yield* Ref.set(getOrCreateBoolRef(stoppedRefs, launchTarget), true);
  clearConnectedAgent(launchTarget);
  clearPromptSpansForLaunchTarget(launchTarget);
});

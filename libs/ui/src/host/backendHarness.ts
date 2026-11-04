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
import { Cause, Effect, Exit, Ref } from 'effect';

import { makeAcpLaunchCommand } from './acpLaunchCommand.ts';
import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { airCapability, airMeta } from './airMeta.ts';
import {
  ANTIGRAVITY_OAUTH_PERSONAL,
  ANTIGRAVITY_SIGN_IN_TIMEOUT,
  AntigravitySignInTimedOut,
  classifyBootstrapFailure,
  consumeAntigravityAuthStderr,
} from './antigravityAuth.ts';
import { makeClientHandlers } from './clientHandlers.ts';
import type { ConfigOptionIndex } from './configProbe.ts';
import type { SessionListScope } from './sessionListScope.ts';
import { runConfigProbe } from './configProbe.ts';
import type { MissingLaunchPrerequisite } from './findExecutableOnPath.ts';
import type { HarnessFailure } from './harnessFailure.ts';
import type { VendorNotAuthenticated } from './vendorCliAuth.ts';
import { clearPromptSpansForLaunchTarget } from './promptSpanRegistry.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import { clearConnectedAgent, setConnectedAgent } from './sessionRpc.ts';

export { AntigravitySignInTimedOut };

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
  readonly receivedAt: number;
};

export type BackendHarnessCallbacks = {
  readonly onAntigravityAuthUrl?: (url: string) => void;
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
  readonly onPhase: (phase: AcpBootstrapPhase, failure?: HarnessFailure) => void;
  readonly onRpcMessage: (direction: RpcWireEntry['direction'], message: unknown) => void;
  readonly onSessionHistoryRequest: () => void;
  readonly onSessionHistoryResult: (result: unknown, scope: SessionListScope) => void;
  readonly onSessionUpdate: (sessionId: string, update: unknown) => void;
};

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

/** Connect + initialize + optional Sign in + Config probe + buffered history list through ready. */
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
    yield* Effect.logInfo('ACP harness probing', launchTarget);

    const listScope = resolveListScope();
    const listPayload = listSessionsPayload(listScope);
    if (listPayload !== undefined) handlers.onSessionHistoryRequest();
    const listResult = listPayload === undefined ? { sessions: [] } : yield* agent['session/list'](listPayload);
    const index = yield* runConfigProbe(agent);
    handlers.onConfigOptionIndexPublish(index);
    if (listPayload !== undefined) handlers.onSessionHistoryResult(listResult, listScope);
    handlers.onPhase('ready');
    yield* Effect.logInfo('ACP harness ready', launchTarget);
    onReady();
  },
  (effect, launchTarget) => effect.pipe(Effect.annotateLogs({ launchTarget, module: 'backendHarness' })),
);

/**
 * Spawns an ACP agent, bootstraps a session, and blocks until interrupted. Retries up to 3 times on failure.
 * Process lifetime is owned by `BackendLifecycle`; interruption kills the process tree and awaits exit.
 */
export const runBackendHarness = Effect.fnUntraced(
  function* (
    launchTarget: AgentLaunchTarget,
    handlers: BackendHarnessCallbacks,
    resolveListScope: () => SessionListScope,
  ) {
    const consecutiveFailures = { count: 0 };
    yield* Effect.logInfo('ACP harness started', launchTarget);

    // Runs until interrupted: `BackendLifecycle.stop` interrupts this fiber and awaits the scope finalizers.
    while (true) {
      const exit = yield* Effect.exit(
        bootstrapOnce(launchTarget, handlers, resolveListScope, () => {
          consecutiveFailures.count = 0;
        }).pipe(
          Effect.andThen(Effect.never),
          Effect.scoped,
          Effect.catchTag('MissingLaunchPrerequisite', (error: MissingLaunchPrerequisite) =>
            Effect.gen(function* () {
              yield* Effect.logError('ACP harness missing launch prerequisite', launchTarget, error.message);
              handlers.onPhase('error', { _tag: 'Failed', message: error.message });
            }),
          ),
          Effect.catchTag('VendorNotAuthenticated', (error: VendorNotAuthenticated) =>
            Effect.gen(function* () {
              yield* Effect.logError('ACP harness vendor CLI not authenticated', launchTarget, error.message);
              handlers.onPhase('error', { _tag: 'NotSignedIn', message: error.message });
            }),
          ),
        ),
      );
      if (Exit.isSuccess(exit)) {
        // MissingLaunchPrerequisite is terminal until Restart; Effect.never never succeeds.
        return;
      }

      // A clean `BackendLifecycle.stop` interrupts this fiber; that is not a failure to publish.
      if (Cause.hasInterruptsOnly(exit.cause)) {
        return;
      }
      const failure = classifyBootstrapFailure(launchTarget, exit.cause);
      yield* Effect.logError('ACP harness bootstrap failed', launchTarget, failure.message);
      handlers.onPhase('error', failure);
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

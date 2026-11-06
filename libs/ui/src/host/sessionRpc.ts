/**
 * Backend connection: the live ACP Connection per launch target and the state that lives exactly as long (RPC
 * handles, prompt spans, subagent links, Lazy hydrate sink). Registered only by `registerBackendConnection`, for the
 * lifetime of a Scope; agent handles stay private to this module. The scope closes on Stop (Restart, Disable, Sign in,
 * runtime Install or Remove, Recheck), on a failed bootstrap attempt before its retry, and on the last failed attempt.
 * A Provider process that dies after `ready` is not yet noticed: its registration stays until one of those.
 */
import type { AcpAgentConnection, ContentBlock } from '@libs/effect-acp';
import { Effect, Predicate, Schema } from 'effect';
import type { Scope, Tracer } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { rootAncestor } from './ancestry.ts';
import type { ConfigIndexEvent } from './configOptionIndexHydrate.ts';
import type { ListSessionsPayload } from './sessionListScope.ts';

/** What a Backend connection reports to its owner (the Harness event fold). */
export type BackendConnectionReports = {
  /** Lazy hydrate: one live ACP response to fold into the Config option index. */
  readonly onConfigIndexEvent: (event: ConfigIndexEvent) => void;
  /** Runs once when the registration's scope closes, after the connection became unreachable. Must not throw. */
  readonly onConnectionLost: () => void;
};

type ConnectionHandles = Pick<
  AcpAgentConnection,
  'agent' | 'notify' | 'sessionArchive' | 'sessionFork' | 'sessionRename' | 'sessionSteering'
>;

type BackendConnection = ConnectionHandles & {
  readonly onConfigIndexEvent: BackendConnectionReports['onConfigIndexEvent'];
  /** Active `sendPrompt` spans by session id, for turn-correlated Agent→Client work. */
  readonly promptSpans: Map<string, Tracer.AnySpan>;
  /** child session id → announcing parent, so child work parents under the root ancestor's prompt span. */
  readonly subagentParents: Map<string, string>;
};

export class BackendNotConnected extends Schema.TaggedError<BackendNotConnected>()('BackendNotConnected', {
  launchTarget: Schema.String,
}) {}

const backendConnections = new Map<AgentLaunchTarget, BackendConnection>();

/**
 * Make `launchTarget`'s session RPCs reach `connection` for the lifetime of the current Scope. On scope close, if this
 * is still the current registration: session RPCs for `launchTarget` fail `BackendNotConnected`, its prompt spans and
 * subagent links are gone, then `reports.onConnectionLost()` runs exactly once. A registration superseded by a later
 * one is released silently. At most one live registration per launch target is expected (`BackendLifecycle`).
 */
export const registerBackendConnection = (
  launchTarget: AgentLaunchTarget,
  connection: ConnectionHandles,
  reports: BackendConnectionReports,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const record: BackendConnection = {
        agent: connection.agent,
        notify: connection.notify,
        onConfigIndexEvent: reports.onConfigIndexEvent,
        promptSpans: new Map(),
        sessionArchive: connection.sessionArchive,
        sessionFork: connection.sessionFork,
        sessionRename: connection.sessionRename,
        sessionSteering: connection.sessionSteering,
        subagentParents: new Map(),
      };
      backendConnections.set(launchTarget, record);
      return record;
    }),
    record =>
      Effect.sync(() => {
        if (backendConnections.get(launchTarget) !== record) {
          return;
        }
        backendConnections.delete(launchTarget);
        reports.onConnectionLost();
      }),
  ).pipe(Effect.asVoid);

/** Child ids resolve to the root ancestor's in-flight prompt span; a closed root turn yields undefined (short root). */
export const getPromptSpan = (launchTarget: AgentLaunchTarget, sessionId: string): Tracer.AnySpan | undefined => {
  const connection = backendConnections.get(launchTarget);
  return connection?.promptSpans.get(rootAncestor(id => connection.subagentParents.get(id), sessionId));
};

/** Record `childId`'s announcing parent on the live connection (first link wins; no-op when not connected). */
export const setSubagentParent = (launchTarget: AgentLaunchTarget, childId: string, parentId: string): void => {
  const parents = backendConnections.get(launchTarget)?.subagentParents;
  if (parents !== undefined && !parents.has(childId)) {
    parents.set(childId, parentId);
  }
};

/** Transport-level failures say nothing about the model, so they never mark it unavailable. */
const isTransportFailure = (error: unknown): boolean =>
  Predicate.isTagged(error, 'RpcClientError') ||
  Predicate.isTagged(error, 'TransportError') ||
  Predicate.isTagged(error, 'BackendNotConnected');

const requireBackendConnection = (
  launchTarget: AgentLaunchTarget,
): Effect.Effect<BackendConnection, BackendNotConnected> => {
  const connection = backendConnections.get(launchTarget);
  if (connection === undefined) {
    return Effect.fail(new BackendNotConnected({ launchTarget }));
  }
  return Effect.succeed(connection);
};

export const listSessions = Effect.fn('listSessions')(
  function* (launchTarget: AgentLaunchTarget, payload: ListSessionsPayload) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    return yield* agent['session/list'](payload);
  },
  Effect.tap(() => Effect.logDebug('session/list ok')),
  Effect.tapError(error => Effect.logError('session/list failed', error)),
);

export const createSession = Effect.fn('createSession')(
  function* (launchTarget: AgentLaunchTarget, cwd: string) {
    const { agent, onConfigIndexEvent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Creating ACP session', { cwd });
    const result = yield* agent['session/new']({ cwd, mcpServers: [] });
    yield* Effect.logInfo('Created ACP session', { sessionId: result.sessionId });
    onConfigIndexEvent({ _tag: 'SessionNew', response: result });
    return { cwd, result };
  },
  Effect.tapError(error => Effect.logError('session/new failed', error)),
);

/** Unstable `session/fork`. Caller owns any UI materialize of the response. */
export const forkSession = Effect.fn('forkSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { sessionFork } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Forking ACP session', sessionId, { cwd });
    const result = yield* sessionFork({ cwd, mcpServers: [], sessionId });
    yield* Effect.logInfo('Forked ACP session', {
      forkedSessionId: result.sessionId,
      parentSessionId: sessionId,
    });
    return result;
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/fork failed', sessionId, error))),
);

export const loadSession = Effect.fn('loadSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Loading ACP session', sessionId, { cwd });
    return yield* agent['session/load']({ cwd, mcpServers: [], sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/load failed', sessionId, error))),
);

export const resumeSession = Effect.fn('resumeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Resuming ACP session', sessionId, { cwd });
    return yield* agent['session/resume']({ cwd, sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/resume failed', sessionId, error))),
);

export const closeSession = Effect.fn('closeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Closing ACP session', sessionId);
    yield* agent['session/close']({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/close failed', sessionId, error))),
);

export const archiveSession = Effect.fn('archiveSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { sessionArchive } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Archiving ACP session', sessionId);
    yield* sessionArchive({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('_session/archive failed', sessionId, error))),
);

export const renameSession = Effect.fn('renameSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, title: string) {
    const { sessionRename } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Renaming ACP session', sessionId);
    yield* sessionRename({ sessionId, title });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('_session/rename failed', sessionId, error))),
);

export const deleteSession = Effect.fn('deleteSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Deleting ACP session', sessionId);
    yield* agent['session/delete']({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/delete failed', sessionId, error))),
);

export const sendPrompt = Effect.fn('sendPrompt')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, prompt: readonly ContentBlock[]) {
    const { agent, promptSpans } = yield* requireBackendConnection(launchTarget);
    yield* Effect.annotateCurrentSpan({
      'acp.agent': launchTarget,
      'acp.sessionId': sessionId,
    });
    const span = yield* Effect.currentSpan;
    promptSpans.set(sessionId, span);
    const textChars = prompt.reduce((sum, block) => sum + (block.type === 'text' ? block.text.length : 0), 0);
    yield* Effect.logDebug('session/prompt', sessionId, { blocks: prompt.length, textChars });
    return yield* agent['session/prompt']({
      prompt: [...prompt],
      sessionId,
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          promptSpans.delete(sessionId);
        }),
      ),
    );
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/prompt failed', launchTarget, sessionId, error))),
);

/**
 * `_session/steering`: inject `prompt` into the in-flight turn. Always opts into `promptRequired` so an idle
 * Agent never starts a detached turn; caller falls back to `session/prompt` on that outcome.
 */
export const steerSession = Effect.fn('steerSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, prompt: readonly ContentBlock[]) {
    const { sessionSteering } = yield* requireBackendConnection(launchTarget);
    yield* Effect.annotateCurrentSpan({
      'acp.agent': launchTarget,
      'acp.sessionId': sessionId,
    });
    yield* Effect.logDebug('_session/steering', sessionId, { blocks: prompt.length });
    return yield* sessionSteering({
      _meta: { steering: { idleBehavior: 'promptRequired' } },
      prompt: [...prompt],
      sessionId,
    });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('_session/steering failed', launchTarget, sessionId, error))),
);

/** ACP Client→Agent notification (no JSON-RPC id). Must use transport.notify, not RpcClient. */
export const cancelSession = Effect.fn('cancelSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { notify } = yield* requireBackendConnection(launchTarget);
    yield* Effect.annotateCurrentSpan({
      'acp.agent': launchTarget,
      'acp.sessionId': sessionId,
    });
    yield* Effect.logDebug('session/cancel', sessionId);
    yield* notify('session/cancel', { sessionId });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/cancel failed', launchTarget, sessionId, error))),
);

export const setConfigOption = Effect.fn('setConfigOption')(
  function* (
    launchTarget: AgentLaunchTarget,
    sessionId: string,
    configId: string,
    optionValue:
      | { readonly type: 'boolean'; readonly value: boolean }
      | { readonly type: 'select'; readonly value: string },
  ) {
    const { agent, onConfigIndexEvent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logDebug('session/set_config_option', sessionId, configId, optionValue);
    const call =
      optionValue.type === 'boolean'
        ? agent['session/set_config_option']({ configId, sessionId, type: 'boolean', value: optionValue.value })
        : agent['session/set_config_option']({ configId, sessionId, value: optionValue.value });
    if (configId !== 'model' || optionValue.type !== 'select') {
      return yield* call;
    }
    // Lazy hydrate: a model pick's response is that model's full row; an agent-refused pick marks it unavailable.
    return yield* call.pipe(
      Effect.tap(response =>
        Effect.sync(() => {
          onConfigIndexEvent({ _tag: 'ModelPicked', modelId: optionValue.value, response });
        }),
      ),
      Effect.tapError(error =>
        Effect.sync(() => {
          if (!isTransportFailure(error)) {
            onConfigIndexEvent({ _tag: 'ModelPickFailed', modelId: optionValue.value });
          }
        }),
      ),
    );
  },
  (effect, _launchTarget, sessionId, configId) =>
    effect.pipe(
      Effect.tapError(error => Effect.logError('session/set_config_option failed', sessionId, configId, error)),
    ),
);

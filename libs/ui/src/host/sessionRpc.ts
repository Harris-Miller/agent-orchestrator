/**
 * Backend connection: the live ACP Connection per launch target and the state that lives exactly as long (RPC
 * handles, prompt spans, subagent links, Lazy hydrate sink). Registered only by `registerBackendConnection`, for the
 * lifetime of a Scope; agent handles stay private to this module. The scope closes on Stop (Restart, Disable, Sign in,
 * runtime Install or Remove, Recheck), on a failed bootstrap attempt before its retry, and on the last failed attempt.
 * A Provider process that dies after `ready` is not yet noticed: its registration stays until one of those.
 */
import type { AcpAgentConnection, ContentBlock, StopReason } from '@libs/effect-acp';
import { Clock, Effect, Exit, Predicate, Redacted, Schedule, Schema } from 'effect';
import type { Scope, Tracer } from 'effect';

import { ACP_FORK_SOURCE_SESSION_ID, sessionAttributes } from '@lib/hub/telemetryKeys';

import { promptResponseTelemetry } from './acpTelemetry.ts';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { rootAncestor } from './ancestry.ts';
import type { ConfigIndexEvent } from './configOptionIndexHydrate.ts';
import { beginMcp, revokeLaunchTargetMcp, revokeSessionMcp } from './hubSessions.ts';
import { listSessionPage } from './listSessionPages.ts';
import type { PromptTurn } from './promptTurnTelemetry.ts';
import {
  closeOrphanedToolCalls,
  makePromptTurn,
  promptTurnSummary,
  recordCancelRequested,
  takeDueTurnAlarms,
} from './promptTurnTelemetry.ts';
import type { ListSessionsPayload } from './sessionListScope.ts';
import { annotateLaunchTargetLogs, annotateNewSessionLogs, annotateSessionLogs } from './sessionTelemetry.ts';

/** What a Backend connection reports to its owner (the Harness event fold). */
export type BackendConnectionReports = {
  /** Lazy hydrate: one live ACP response to fold into the Config option index. */
  readonly onConfigIndexEvent: (event: ConfigIndexEvent) => void;
  /** Runs once when the registration's scope closes, after the connection became unreachable. Must not throw. */
  readonly onConnectionLost: () => void;
};

type ConnectionHandles = Pick<
  AcpAgentConnection,
  'agent' | 'notify' | 'sessionArchive' | 'sessionFork' | 'sessionRename' | 'sessionSteering' | 'sessionUnarchive'
>;

type BackendConnection = ConnectionHandles & {
  /** The Agent advertised `mcpCapabilities.http`, so the hub can be injected as an MCP server. */
  mcpHttp: boolean;
  readonly onConfigIndexEvent: BackendConnectionReports['onConfigIndexEvent'];
  /** In-flight Prompt turns by session id: their span parents turn-correlated Agent→Client work. */
  readonly promptTurns: Map<string, PromptTurn>;
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
        mcpHttp: false,
        notify: connection.notify,
        onConfigIndexEvent: reports.onConfigIndexEvent,
        promptTurns: new Map(),
        sessionArchive: connection.sessionArchive,
        sessionFork: connection.sessionFork,
        sessionRename: connection.sessionRename,
        sessionSteering: connection.sessionSteering,
        sessionUnarchive: connection.sessionUnarchive,
        subagentParents: new Map(),
      };
      backendConnections.set(launchTarget, record);
      return record;
    }),
    record =>
      Effect.suspend(() => {
        if (backendConnections.get(launchTarget) !== record) {
          return Effect.void;
        }
        backendConnections.delete(launchTarget);
        reports.onConnectionLost();
        const turns = [...record.promptTurns.values()];
        record.promptTurns.clear();
        // Its sessions died with the agent process: their hub credentials must stop working too.
        return Effect.andThen(
          Effect.forEach(turns, turn => closeOrphanedToolCalls(turn, undefined), { discard: true }),
          revokeLaunchTargetMcp(launchTarget),
        );
      }),
  ).pipe(Effect.asVoid);

/** Record whether `launchTarget`'s Agent advertised HTTP MCP (read from its initialize result); no-op when not connected. */
export const setBackendMcpHttp = (launchTarget: AgentLaunchTarget, supported: boolean): void => {
  const connection = backendConnections.get(launchTarget);
  if (connection !== undefined) {
    connection.mcpHttp = supported;
  }
};

/** Child ids resolve to the root ancestor's in-flight Prompt turn; a closed root turn yields undefined (short root). */
export const getPromptTurn = (launchTarget: AgentLaunchTarget, sessionId: string): PromptTurn | undefined => {
  const connection = backendConnections.get(launchTarget);
  return connection?.promptTurns.get(rootAncestor(id => connection.subagentParents.get(id), sessionId));
};

/** The span of {@link getPromptTurn}. */
export const getPromptSpan = (launchTarget: AgentLaunchTarget, sessionId: string): Tracer.AnySpan | undefined =>
  getPromptTurn(launchTarget, sessionId)?.span;

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

/** Log a typed failure of an RPC. Not `tapCause`: that also fires on interruption, and a user cancel is not an error. */
const logFailure =
  (label: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.tapError(error => Effect.logError(label, error)));

const requireBackendConnection = (
  launchTarget: AgentLaunchTarget,
): Effect.Effect<BackendConnection, BackendNotConnected> => {
  const connection = backendConnections.get(launchTarget);
  if (connection === undefined) {
    return Effect.fail(new BackendNotConnected({ launchTarget }));
  }
  return Effect.succeed(connection);
};

/** One `session/list` page of a launch target (`cursor` omitted: the first). */
export const listSessionsPage = Effect.fn('listSessionsPage')(
  function* (launchTarget: AgentLaunchTarget, payload: ListSessionsPayload, cursor: string | undefined) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    return yield* listSessionPage(agent, payload, cursor);
  },
  Effect.tap(() => Effect.logDebug('session/list ok')),
  (effect, launchTarget) => effect.pipe(logFailure('session/list failed'), annotateLaunchTargetLogs(launchTarget)),
);

const createSessionTraced = Effect.fn('createSession')(
  function* (launchTarget: AgentLaunchTarget, cwd: string, parentSessionId: string | undefined) {
    const { agent, mcpHttp, onConfigIndexEvent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Creating ACP session').pipe(Effect.annotateLogs({ cwd: Redacted.make(cwd) }));
    const mcp = yield* beginMcp(launchTarget, mcpHttp, parentSessionId);
    const result = yield* agent['session/new']({ cwd, ...mcp.params }).pipe(Effect.onError(() => mcp.abandon));
    yield* mcp.bind(result.sessionId);
    yield* Effect.logInfo('Created ACP session').pipe(
      annotateSessionLogs(launchTarget, result.sessionId, parentSessionId),
    );
    onConfigIndexEvent({ _tag: 'SessionNew', response: result });
    return { cwd, result };
  },
  (effect, launchTarget, _cwd, parentSessionId) =>
    effect.pipe(logFailure('session/new failed'), annotateNewSessionLogs(launchTarget, parentSessionId)),
);

/** `session/new`; `parentSessionId` is set for a Spawned subagent session. The failure log runs inside the span. */
export const createSession = (launchTarget: AgentLaunchTarget, cwd: string, parentSessionId?: string) =>
  createSessionTraced(launchTarget, cwd, parentSessionId);

/** Unstable `session/fork`. Caller owns any UI materialize of the response. */
export const forkSession = Effect.fn('forkSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { mcpHttp, sessionFork } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Forking ACP session').pipe(Effect.annotateLogs({ cwd: Redacted.make(cwd) }));
    const mcp = yield* beginMcp(launchTarget, mcpHttp);
    const result = yield* sessionFork({ cwd, ...mcp.params, sessionId }).pipe(Effect.onError(() => mcp.abandon));
    // Some agents answer without an id (the caller then skips the fork); the credential has no session to bind to.
    yield* (result.sessionId as string | undefined) === undefined ? mcp.abandon : mcp.bind(result.sessionId);
    yield* Effect.logInfo('Forked ACP session').pipe(
      Effect.annotateLogs({
        ...sessionAttributes(launchTarget, result.sessionId),
        [ACP_FORK_SOURCE_SESSION_ID]: sessionId,
      }),
    );
    return result;
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/fork failed'), annotateSessionLogs(launchTarget, sessionId)),
);

export const loadSession = Effect.fn('loadSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { agent, mcpHttp } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Loading ACP session').pipe(Effect.annotateLogs({ cwd: Redacted.make(cwd) }));
    const mcp = yield* beginMcp(launchTarget, mcpHttp);
    const result = yield* agent['session/load']({ cwd, ...mcp.params, sessionId }).pipe(
      Effect.onError(() => mcp.abandon),
    );
    yield* mcp.bind(sessionId);
    return result;
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/load failed'), annotateSessionLogs(launchTarget, sessionId)),
);

export const resumeSession = Effect.fn('resumeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { agent, mcpHttp } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Resuming ACP session').pipe(Effect.annotateLogs({ cwd: Redacted.make(cwd) }));
    const mcp = yield* beginMcp(launchTarget, mcpHttp);
    const result = yield* agent['session/resume']({ cwd, ...mcp.params, sessionId }).pipe(
      Effect.onError(() => mcp.abandon),
    );
    yield* mcp.bind(sessionId);
    return result;
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/resume failed'), annotateSessionLogs(launchTarget, sessionId)),
);

export const closeSession = Effect.fn('closeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Closing ACP session');
    yield* revokeSessionMcp(launchTarget, sessionId);
    yield* agent['session/close']({ sessionId });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/close failed'), annotateSessionLogs(launchTarget, sessionId)),
);

export const archiveSession = Effect.fn('archiveSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { sessionArchive } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Archiving ACP session');
    yield* sessionArchive({ sessionId });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('_session/archive failed'), annotateSessionLogs(launchTarget, sessionId)),
);

export const unarchiveSession = Effect.fn('unarchiveSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { sessionUnarchive } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Unarchiving ACP session');
    yield* sessionUnarchive({ sessionId });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('_session/unarchive failed'), annotateSessionLogs(launchTarget, sessionId)),
);

export const renameSession = Effect.fn('renameSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, title: string) {
    const { sessionRename } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Renaming ACP session');
    yield* sessionRename({ sessionId, title });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('_session/rename failed'), annotateSessionLogs(launchTarget, sessionId)),
);

export const deleteSession = Effect.fn('deleteSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { agent } = yield* requireBackendConnection(launchTarget);
    yield* Effect.logInfo('Deleting ACP session');
    yield* revokeSessionMcp(launchTarget, sessionId);
    yield* agent['session/delete']({ sessionId });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/delete failed'), annotateSessionLogs(launchTarget, sessionId)),
);

/** Warn while a turn is silent too long or ignores a cancel: a hung turn never ends its span, so this is its only trace. */
const checkPromptTurn = Effect.fnUntraced(function* (turn: PromptTurn) {
  for (const alarm of takeDueTurnAlarms(turn, yield* Clock.currentTimeMillis)) {
    yield* alarm._tag === 'Silent'
      ? Effect.logWarning('Prompt turn silent').pipe(
          Effect.annotateLogs({ open_tool_calls: alarm.openToolCalls, silent_ms: alarm.silentMs }),
        )
      : Effect.logWarning('Prompt turn unresolved after session/cancel').pipe(
          Effect.annotateLogs({ since_cancel_ms: alarm.sinceCancelMs }),
        );
  }
});

const watchPromptTurn = (turn: PromptTurn) =>
  checkPromptTurn(turn).pipe(Effect.repeat(Schedule.spaced('5 seconds')), Effect.withParentSpan(turn.span));

/** Record the turn's tally and stop reason on its span, close orphaned tool calls, and forget the turn. */
const endPromptTurn = Effect.fnUntraced(function* (
  promptTurns: Map<string, PromptTurn>,
  sessionId: string,
  turn: PromptTurn,
  span: Tracer.Span,
  exit: Exit.Exit<{ readonly stopReason: StopReason; readonly usage?: unknown }, unknown>,
) {
  if (promptTurns.get(sessionId) === turn) {
    promptTurns.delete(sessionId);
  }
  const attributes = {
    ...promptTurnSummary(turn, yield* Clock.currentTimeMillis),
    ...(Exit.isSuccess(exit) ? promptResponseTelemetry(exit.value) : {}),
  };
  for (const [key, value] of Object.entries(attributes)) {
    span.attribute(key, value);
  }
  yield* closeOrphanedToolCalls(turn, Exit.isSuccess(exit) ? exit.value.stopReason : undefined);
});

export const sendPrompt = Effect.fn('sendPrompt')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, prompt: readonly ContentBlock[]) {
    const { agent, promptTurns } = yield* requireBackendConnection(launchTarget);
    yield* Effect.annotateCurrentSpan(sessionAttributes(launchTarget, sessionId));
    const span = yield* Effect.currentSpan;
    const turn = makePromptTurn(span, yield* Clock.currentTimeMillis);
    promptTurns.set(sessionId, turn);
    const textChars = prompt.reduce((sum, block) => sum + (block.type === 'text' ? block.text.length : 0), 0);
    yield* Effect.logDebug('session/prompt').pipe(
      Effect.annotateLogs({ blocks: prompt.length, text_chars: textChars }),
    );
    yield* Effect.forkScoped(watchPromptTurn(turn));
    return yield* agent['session/prompt']({
      prompt: [...prompt],
      sessionId,
    }).pipe(Effect.onExit(exit => endPromptTurn(promptTurns, sessionId, turn, span, exit)));
  },
  Effect.scoped,
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/prompt failed'), annotateSessionLogs(launchTarget, sessionId)),
);

/**
 * `_session/steering`: inject `prompt` into the in-flight turn. Always opts into `promptRequired` so an idle
 * Agent never starts a detached turn; caller falls back to `session/prompt` on that outcome.
 */
export const steerSession = Effect.fn('steerSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, prompt: readonly ContentBlock[]) {
    const { sessionSteering } = yield* requireBackendConnection(launchTarget);
    yield* Effect.annotateCurrentSpan(sessionAttributes(launchTarget, sessionId));
    yield* Effect.logDebug('_session/steering').pipe(Effect.annotateLogs({ blocks: prompt.length }));
    return yield* sessionSteering({
      _meta: { steering: { idleBehavior: 'promptRequired' } },
      prompt: [...prompt],
      sessionId,
    });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('_session/steering failed'), annotateSessionLogs(launchTarget, sessionId)),
);

/** ACP Client→Agent notification (no JSON-RPC id). Must use transport.notify, not RpcClient. */
export const cancelSession = Effect.fn('cancelSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { notify, promptTurns } = yield* requireBackendConnection(launchTarget);
    yield* Effect.annotateCurrentSpan(sessionAttributes(launchTarget, sessionId));
    yield* Effect.logDebug('session/cancel');
    const turn = promptTurns.get(sessionId);
    if (turn !== undefined) {
      recordCancelRequested(turn, yield* Clock.currentTimeMillis);
    }
    yield* notify('session/cancel', { sessionId });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/cancel failed'), annotateSessionLogs(launchTarget, sessionId)),
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
    yield* Effect.logDebug('session/set_config_option').pipe(Effect.annotateLogs({ option_type: optionValue.type }));
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
  (effect, launchTarget, sessionId) =>
    effect.pipe(logFailure('session/set_config_option failed'), annotateSessionLogs(launchTarget, sessionId)),
);

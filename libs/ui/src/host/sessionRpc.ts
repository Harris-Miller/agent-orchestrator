/** Launch-target-keyed ACP session RPC. Agent handles stay private to this module. */
import type { AcpAgentConnection, ContentBlock } from '@libs/effect-acp';
import { Effect, Schema } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { clearPromptSpan, setPromptSpan } from './promptSpanRegistry.ts';
import type { ListSessionsPayload } from './sessionListScope.ts';

type AgentHandle = AcpAgentConnection['agent'];
type ConnectedAgent = {
  readonly agent: AgentHandle;
  readonly notify: AcpAgentConnection['notify'];
  readonly sessionArchive: AcpAgentConnection['sessionArchive'];
  readonly sessionFork: AcpAgentConnection['sessionFork'];
  readonly sessionSteering: AcpAgentConnection['sessionSteering'];
};

export class BackendNotConnected extends Schema.TaggedError<BackendNotConnected>()('BackendNotConnected', {
  launchTarget: Schema.String,
}) {}

const connectedAgents = new Map<AgentLaunchTarget, ConnectedAgent>();

const requireConnectedAgent = (launchTarget: AgentLaunchTarget): Effect.Effect<ConnectedAgent, BackendNotConnected> => {
  const connected = connectedAgents.get(launchTarget);
  if (connected === undefined) {
    return Effect.fail(new BackendNotConnected({ launchTarget }));
  }
  return Effect.succeed(connected);
};

/** Lifecycle hook — backendHarness registers the live agent after connect. */
export const setConnectedAgent = (
  launchTarget: AgentLaunchTarget,
  connection: Pick<AcpAgentConnection, 'agent' | 'notify' | 'sessionArchive' | 'sessionFork' | 'sessionSteering'>,
): void => {
  connectedAgents.set(launchTarget, {
    agent: connection.agent,
    notify: connection.notify,
    sessionArchive: connection.sessionArchive,
    sessionFork: connection.sessionFork,
    sessionSteering: connection.sessionSteering,
  });
};

/** Lifecycle hook — backendHarness clears the agent on stop / retry / reset. */
export const clearConnectedAgent = (launchTarget: AgentLaunchTarget): void => {
  connectedAgents.delete(launchTarget);
};

export const listSessions = Effect.fn('listSessions')(
  function* (launchTarget: AgentLaunchTarget, payload: ListSessionsPayload) {
    const { agent } = yield* requireConnectedAgent(launchTarget);
    return yield* agent['session/list'](payload);
  },
  Effect.tap(() => Effect.logDebug('session/list ok')),
  Effect.tapError(error => Effect.logError('session/list failed', error)),
);

export const createSession = Effect.fn('createSession')(
  function* (launchTarget: AgentLaunchTarget, cwd: string) {
    const { agent } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Creating ACP session', { cwd });
    const result = yield* agent['session/new']({ cwd, mcpServers: [] });
    yield* Effect.logInfo('Created ACP session', { sessionId: result.sessionId });
    return { cwd, result };
  },
  Effect.tapError(error => Effect.logError('session/new failed', error)),
);

/** Unstable `session/fork`. Caller owns any UI materialize of the response. */
export const forkSession = Effect.fn('forkSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { sessionFork } = yield* requireConnectedAgent(launchTarget);
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
    const { agent } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Loading ACP session', sessionId, { cwd });
    return yield* agent['session/load']({ cwd, mcpServers: [], sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/load failed', sessionId, error))),
);

export const resumeSession = Effect.fn('resumeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const { agent } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Resuming ACP session', sessionId, { cwd });
    return yield* agent['session/resume']({ cwd, sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/resume failed', sessionId, error))),
);

export const closeSession = Effect.fn('closeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { agent } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Closing ACP session', sessionId);
    yield* agent['session/close']({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/close failed', sessionId, error))),
);

export const archiveSession = Effect.fn('archiveSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { sessionArchive } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Archiving ACP session', sessionId);
    yield* sessionArchive({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('_session/archive failed', sessionId, error))),
);

export const deleteSession = Effect.fn('deleteSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const { agent } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Deleting ACP session', sessionId);
    yield* agent['session/delete']({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/delete failed', sessionId, error))),
);

export const sendPrompt = Effect.fn('sendPrompt')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, prompt: readonly ContentBlock[]) {
    const { agent } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.annotateCurrentSpan({
      'acp.agent': launchTarget,
      'acp.sessionId': sessionId,
    });
    const span = yield* Effect.currentSpan;
    setPromptSpan(launchTarget, sessionId, span);
    const textChars = prompt.reduce((sum, block) => sum + (block.type === 'text' ? block.text.length : 0), 0);
    yield* Effect.logDebug('session/prompt', sessionId, { blocks: prompt.length, textChars });
    return yield* agent['session/prompt']({
      prompt: [...prompt],
      sessionId,
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          clearPromptSpan(launchTarget, sessionId);
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
    const { sessionSteering } = yield* requireConnectedAgent(launchTarget);
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
    const { notify } = yield* requireConnectedAgent(launchTarget);
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
    const { agent } = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logDebug('session/set_config_option', sessionId, configId, optionValue);
    if (optionValue.type === 'boolean') {
      return yield* agent['session/set_config_option']({
        configId,
        sessionId,
        type: 'boolean',
        value: optionValue.value,
      });
    }
    return yield* agent['session/set_config_option']({
      configId,
      sessionId,
      value: optionValue.value,
    });
  },
  (effect, _launchTarget, sessionId, configId) =>
    effect.pipe(
      Effect.tapError(error => Effect.logError('session/set_config_option failed', sessionId, configId, error)),
    ),
);

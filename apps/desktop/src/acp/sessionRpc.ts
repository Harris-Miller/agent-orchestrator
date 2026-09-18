/** Launch-target-keyed ACP session RPC. Agent handles stay private to this module. */
import { TauriServicesLive } from '@lib/context-services-tauri';
import type { AcpAgentConnection } from '@libs/effect-acp';
import { Effect, Schema } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { clearPromptSpan, setPromptSpan } from './promptSpanRegistry.ts';

type AgentHandle = AcpAgentConnection['agent'];

export class BackendNotConnected extends Schema.TaggedError<BackendNotConnected>()('BackendNotConnected', {
  launchTarget: Schema.String,
}) {}

const agentHandles = new Map<AgentLaunchTarget, AgentHandle>();

const requireConnectedAgent = (launchTarget: AgentLaunchTarget): Effect.Effect<AgentHandle, BackendNotConnected> => {
  const agent = agentHandles.get(launchTarget);
  if (agent === undefined) {
    return Effect.fail(new BackendNotConnected({ launchTarget }));
  }
  return Effect.succeed(agent);
};

/** Lifecycle hook — backendHarness registers the live agent after connect. */
export const setConnectedAgent = (launchTarget: AgentLaunchTarget, agent: AgentHandle): void => {
  agentHandles.set(launchTarget, agent);
};

/** Lifecycle hook — backendHarness clears the agent on stop / retry / reset. */
export const clearConnectedAgent = (launchTarget: AgentLaunchTarget): void => {
  agentHandles.delete(launchTarget);
};

export const listSessions = Effect.fn('listSessions')(
  function* (launchTarget: AgentLaunchTarget) {
    const agent = yield* requireConnectedAgent(launchTarget);
    return yield* agent['session/list']({});
  },
  Effect.tap(() => Effect.logDebug('session/list ok')),
  Effect.tapError(error => Effect.logError('session/list failed', error)),
  Effect.provide(TauriServicesLive),
);

export const createSession = Effect.fn('createSession')(
  function* (launchTarget: AgentLaunchTarget, cwd: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Creating ACP session', { cwd });
    const result = yield* agent['session/new']({ cwd, mcpServers: [] });
    yield* Effect.logInfo('Created ACP session', { sessionId: result.sessionId });
    return { cwd, result };
  },
  Effect.tapError(error => Effect.logError('session/new failed', error)),
);

export const loadSession = Effect.fn('loadSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Loading ACP session', sessionId, { cwd });
    return yield* agent['session/load']({ cwd, mcpServers: [], sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/load failed', sessionId, error))),
);

export const resumeSession = Effect.fn('resumeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, cwd: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Resuming ACP session', sessionId, { cwd });
    return yield* agent['session/resume']({ cwd, sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/resume failed', sessionId, error))),
);

export const closeSession = Effect.fn('closeSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Closing ACP session', sessionId);
    yield* agent['session/close']({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/close failed', sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const deleteSession = Effect.fn('deleteSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logInfo('Deleting ACP session', sessionId);
    yield* agent['session/delete']({ sessionId });
  },
  (effect, _launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/delete failed', sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const sendPrompt = Effect.fn('sendPrompt')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, text: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.annotateCurrentSpan({
      'acp.agent': launchTarget,
      'acp.sessionId': sessionId,
    });
    const span = yield* Effect.currentSpan;
    setPromptSpan(launchTarget, sessionId, span);
    yield* Effect.logDebug('session/prompt', sessionId, { chars: text.length });
    return yield* agent['session/prompt']({
      prompt: [{ text, type: 'text' }],
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
  Effect.provide(TauriServicesLive),
);

export const cancelSession = Effect.fn('cancelSession')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.annotateCurrentSpan({
      'acp.agent': launchTarget,
      'acp.sessionId': sessionId,
    });
    yield* Effect.logDebug('session/cancel', sessionId);
    yield* agent['session/cancel']({ sessionId });
  },
  (effect, launchTarget, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/cancel failed', launchTarget, sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const setConfigOption = Effect.fn('setConfigOption')(
  function* (launchTarget: AgentLaunchTarget, sessionId: string, configId: string, value: string) {
    const agent = yield* requireConnectedAgent(launchTarget);
    yield* Effect.logDebug('session/set_config_option', sessionId, configId, value);
    return yield* agent['session/set_config_option']({
      configId,
      sessionId,
      value,
    });
  },
  (effect, _launchTarget, sessionId, configId) =>
    effect.pipe(
      Effect.tapError(error => Effect.logError('session/set_config_option failed', sessionId, configId, error)),
    ),
  Effect.provide(TauriServicesLive),
);

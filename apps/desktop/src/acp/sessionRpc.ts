/** Backend-keyed ACP session RPC. Resolves the live agent via requireConnectedAgent. */
import { TauriServicesLive } from '@lib/context-services-tauri';
import { Effect } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { requireConnectedAgent } from './backendHarness.ts';
import { clearPromptSpan, setPromptSpan } from './promptSpanRegistry.ts';

export const listSessions = Effect.fn('listSessions')(
  function* (backend: AgentLaunchTarget) {
    const agent = yield* requireConnectedAgent(backend);
    return yield* agent['session/list']({});
  },
  Effect.tap(() => Effect.logDebug('session/list ok')),
  Effect.tapError(error => Effect.logError('session/list failed', error)),
  Effect.provide(TauriServicesLive),
);

export const createSession = Effect.fn('createSession')(
  function* (backend: AgentLaunchTarget, cwd: string) {
    const agent = yield* requireConnectedAgent(backend);
    yield* Effect.logInfo('Creating ACP session', { cwd });
    const result = yield* agent['session/new']({ cwd, mcpServers: [] });
    yield* Effect.logInfo('Created ACP session', { sessionId: result.sessionId });
    return { cwd, result };
  },
  Effect.tapError(error => Effect.logError('session/new failed', error)),
);

export const loadSession = Effect.fn('loadSession')(
  function* (backend: AgentLaunchTarget, sessionId: string, cwd: string) {
    const agent = yield* requireConnectedAgent(backend);
    yield* Effect.logInfo('Loading ACP session', sessionId, { cwd });
    return yield* agent['session/load']({ cwd, mcpServers: [], sessionId });
  },
  (effect, _backend, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/load failed', sessionId, error))),
);

export const resumeSession = Effect.fn('resumeSession')(
  function* (backend: AgentLaunchTarget, sessionId: string, cwd: string) {
    const agent = yield* requireConnectedAgent(backend);
    yield* Effect.logInfo('Resuming ACP session', sessionId, { cwd });
    return yield* agent['session/resume']({ cwd, sessionId });
  },
  (effect, _backend, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/resume failed', sessionId, error))),
);

export const closeSession = Effect.fn('closeSession')(
  function* (backend: AgentLaunchTarget, sessionId: string) {
    const agent = yield* requireConnectedAgent(backend);
    yield* Effect.logInfo('Closing ACP session', sessionId);
    yield* agent['session/close']({ sessionId });
  },
  (effect, _backend, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/close failed', sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const deleteSession = Effect.fn('deleteSession')(
  function* (backend: AgentLaunchTarget, sessionId: string) {
    const agent = yield* requireConnectedAgent(backend);
    yield* Effect.logInfo('Deleting ACP session', sessionId);
    yield* agent['session/delete']({ sessionId });
  },
  (effect, _backend, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/delete failed', sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const sendPrompt = Effect.fn('sendPrompt')(
  function* (backend: AgentLaunchTarget, sessionId: string, text: string) {
    const agent = yield* requireConnectedAgent(backend);
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
  (effect, backend, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('session/prompt failed', backend, sessionId, error))),
  Effect.provide(TauriServicesLive),
);

export const setConfigOption = Effect.fn('setConfigOption')(
  function* (backend: AgentLaunchTarget, sessionId: string, configId: string, value: string) {
    const agent = yield* requireConnectedAgent(backend);
    yield* Effect.logDebug('session/set_config_option', sessionId, configId, value);
    return yield* agent['session/set_config_option']({
      configId,
      sessionId,
      value,
    });
  },
  (effect, _backend, sessionId, configId) =>
    effect.pipe(
      Effect.tapError(error => Effect.logError('session/set_config_option failed', sessionId, configId, error)),
    ),
  Effect.provide(TauriServicesLive),
);

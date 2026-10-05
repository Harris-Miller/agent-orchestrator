import type {
  AcpError,
  AuthenticateRequest,
  CloseSessionRequest,
  DeleteSessionRequest,
  InitializeRequest,
  ListSessionsRequest,
  LoadSessionRequest,
  LoadSessionResponse,
  LogoutRequest,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  ResumeSessionRequest,
  ResumeSessionResponse,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  SetSessionModeRequest,
} from '@libs/effect-acp';
import { AgentRpcs } from '@libs/effect-acp';
import { Effect } from 'effect';

import { listRosterSessions, removeRosterEntry, touchRosterEntry, upsertRosterEntry } from './adapterRosterSessions.ts';
import type { EnsureGeminiChild, GeminiChild } from './geminiChild.ts';
import type { LoadedSet } from './loadedSet.ts';
import { isLoaded, markLoaded, unmarkLoaded } from './loadedSet.ts';
import { rewriteInitializeResponse } from './rewriteInitialize.ts';
import {
  configOptionsFromSnapshot,
  rewriteSessionConfiguration,
  snapshotSessionConfig,
  withModeId,
  withModelId,
} from './rewriteSessionConfiguration.ts';
import type { RewrittenSessionConfiguration } from './rewriteSessionConfiguration.ts';
import type { SessionConfigStore } from './sessionConfigStore.ts';
import { patchSessionConfig, putSessionConfig } from './sessionConfigStore.ts';

/** JSON-RPC internal error — child RpcClient failures become typed Exit, not connection Defect. */
const toAcpError = (error: unknown): AcpError => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const { code, data, message } = error as { data?: unknown } & AcpError;
    return data === undefined ? { code, message } : { code, data, message };
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? (error as { message: string }).message
        : String(error);
  return { code: -32603, message };
};

const withChild = <A>(
  ensureChild: EnsureGeminiChild,
  use: (child: GeminiChild) => Effect.Effect<A, unknown>,
): Effect.Effect<A, AcpError> =>
  Effect.gen(function* () {
    const child = yield* ensureChild;
    return yield* use(child);
  }).pipe(Effect.mapError(toAcpError));

const upsertAndMarkLoaded = Effect.fn('upsertAndMarkLoaded')(function* (
  loaded: LoadedSet,
  entry: { readonly cwd: string; readonly sessionId: string },
) {
  yield* upsertRosterEntry(entry).pipe(Effect.orDie);
  yield* markLoaded(loaded, entry.sessionId);
});

const rememberAndRewrite = Effect.fn('rememberAndRewrite')(function* (
  configs: SessionConfigStore,
  sessionId: string,
  result: unknown,
): Effect.fn.Return<RewrittenSessionConfiguration> {
  yield* putSessionConfig(configs, sessionId, snapshotSessionConfig(result));
  return rewriteSessionConfiguration(result);
});

const setConfigOptionResponse = (
  snapshot: ReturnType<typeof configOptionsFromSnapshot> | undefined,
): SetSessionConfigOptionResponse =>
  ({
    configOptions: snapshot?.configOptions ?? [],
  }) as SetSessionConfigOptionResponse;

/** Agent handler map: cap rewrite + soft lifecycle + configOptions rewrite + transparent forward. */
export const makeGeminiAcpAgentHandlerMap = (
  ensureChild: EnsureGeminiChild,
  loaded: LoadedSet,
  configs: SessionConfigStore,
) =>
  AgentRpcs.of({
    authenticate: (request: AuthenticateRequest) => withChild(ensureChild, child => child.agent.authenticate(request)),
    initialize: (request: InitializeRequest) =>
      withChild(ensureChild, child => child.agent.initialize(request).pipe(Effect.map(rewriteInitializeResponse))),
    logout: (request: LogoutRequest) => withChild(ensureChild, child => child.agent.logout(request)),
    // Notification: no error channel — die on child failure rather than AcpError Exit.
    'session/cancel': (payload: { readonly sessionId: string }) =>
      withChild(ensureChild, child => child.notify('session/cancel', payload)).pipe(Effect.orDie),
    'session/close': (request: CloseSessionRequest) =>
      Effect.gen(function* () {
        if (yield* isLoaded(loaded, request.sessionId)) {
          yield* withChild(ensureChild, child => child.notify('session/cancel', { sessionId: request.sessionId }));
          yield* unmarkLoaded(loaded, request.sessionId);
        }
        yield* touchRosterEntry(request.sessionId).pipe(Effect.orDie);
        return {};
      }),
    'session/delete': (request: DeleteSessionRequest) =>
      Effect.gen(function* () {
        yield* removeRosterEntry(request.sessionId).pipe(Effect.orDie);
        yield* unmarkLoaded(loaded, request.sessionId);
        return {};
      }),
    'session/list': (request: ListSessionsRequest) => listRosterSessions(request.cwd).pipe(Effect.orDie),
    'session/load': (request: LoadSessionRequest) =>
      Effect.gen(function* () {
        const result = yield* withChild(ensureChild, child => child.agent['session/load'](request));
        yield* upsertAndMarkLoaded(loaded, { cwd: request.cwd, sessionId: request.sessionId });
        return (yield* rememberAndRewrite(configs, request.sessionId, result)) as LoadSessionResponse;
      }),
    'session/new': (request: NewSessionRequest) =>
      Effect.gen(function* () {
        const result = yield* withChild(ensureChild, child => child.agent['session/new'](request));
        yield* upsertAndMarkLoaded(loaded, { cwd: request.cwd, sessionId: result.sessionId });
        const rewritten = yield* rememberAndRewrite(configs, result.sessionId, result);
        return { ...rewritten, sessionId: result.sessionId } as NewSessionResponse;
      }),
    'session/prompt': (request: PromptRequest) =>
      withChild(ensureChild, child => child.agent['session/prompt'](request)),
    'session/resume': (request: ResumeSessionRequest) =>
      Effect.gen(function* () {
        if (yield* isLoaded(loaded, request.sessionId)) {
          return {};
        }
        const loadRequest: LoadSessionRequest = {
          cwd: request.cwd,
          mcpServers: request.mcpServers ?? [],
          sessionId: request.sessionId,
          ...(request.additionalDirectories === undefined
            ? {}
            : { additionalDirectories: request.additionalDirectories }),
        };
        const loadResult = yield* withChild(ensureChild, child => child.agent['session/load'](loadRequest));
        yield* upsertAndMarkLoaded(loaded, { cwd: request.cwd, sessionId: request.sessionId });
        const rewritten = yield* rememberAndRewrite(configs, request.sessionId, loadResult);
        return {
          configOptions: rewritten.configOptions,
          ...(rewritten.modes === undefined ? {} : { modes: rewritten.modes }),
        } as ResumeSessionResponse;
      }),
    'session/set_config_option': (request: SetSessionConfigOptionRequest) =>
      Effect.gen(function* () {
        if (request.configId === 'model' && typeof request.value === 'string') {
          const modelId = request.value;
          yield* withChild(ensureChild, child => child.sessionSetModel({ modelId, sessionId: request.sessionId }));
          const snapshot = yield* patchSessionConfig(configs, request.sessionId, s => withModelId(s, modelId));
          return setConfigOptionResponse(snapshot === undefined ? undefined : configOptionsFromSnapshot(snapshot));
        }

        if (request.configId === 'mode' && typeof request.value === 'string') {
          const modeId = request.value;
          yield* withChild(ensureChild, child =>
            child.agent['session/set_mode']({ modeId, sessionId: request.sessionId }),
          );
          const snapshot = yield* patchSessionConfig(configs, request.sessionId, s => withModeId(s, modeId));
          return setConfigOptionResponse(snapshot === undefined ? undefined : configOptionsFromSnapshot(snapshot));
        }

        return yield* withChild(ensureChild, child => child.agent['session/set_config_option'](request));
      }),
    'session/set_mode': (request: SetSessionModeRequest) =>
      Effect.gen(function* () {
        const result = yield* withChild(ensureChild, child => child.agent['session/set_mode'](request));
        yield* patchSessionConfig(configs, request.sessionId, s => withModeId(s, request.modeId));
        return result;
      }),
  });

import type {
  AcpAgentConnection,
  AuthenticateRequest,
  InitializeRequest,
  LoadSessionRequest,
  LogoutRequest,
  NewSessionRequest,
  PromptRequest,
  SetSessionConfigOptionRequest,
  SetSessionModeRequest,
} from '@libs/effect-acp';
import { AgentRpcs } from '@libs/effect-acp';
import type { Layer } from 'effect';
import { Effect, Scope } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { rewriteInitializeResponse } from './rewriteInitialize.ts';

/** Narrow Gemini child surface used by adapter Agent handlers (real connection or test fake). */
export type GeminiChild = {
  readonly agent: Pick<
    AcpAgentConnection['agent'],
    | 'authenticate'
    | 'initialize'
    | 'logout'
    | 'session/load'
    | 'session/new'
    | 'session/prompt'
    | 'session/set_config_option'
    | 'session/set_mode'
  >;
  readonly notify: AcpAgentConnection['notify'];
};

export type EnsureGeminiChild = Effect.Effect<GeminiChild, unknown>;

type AgentHandlersLayer = Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof AgentRpcs>>>;

/** Agent handler map: cap rewrite + stubs + transparent forward to Gemini child. */
export const makeGeminiAcpAgentHandlerMap = (ensureChild: EnsureGeminiChild) =>
  AgentRpcs.of({
    authenticate: (request: AuthenticateRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        return yield* child.agent.authenticate(request);
      }).pipe(Effect.orDie),
    initialize: (request: InitializeRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        const geminiResult = yield* child.agent.initialize(request);
        return rewriteInitializeResponse(geminiResult);
      }).pipe(Effect.orDie),
    logout: (request: LogoutRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        return yield* child.agent.logout(request);
      }).pipe(Effect.orDie),
    'session/cancel': (payload: { readonly sessionId: string }) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        yield* child.notify('session/cancel', payload);
      }).pipe(Effect.orDie),
    'session/close': () => Effect.succeed({}),
    'session/delete': () => Effect.succeed({}),
    'session/list': () => Effect.succeed({ sessions: [] }),
    'session/load': (request: LoadSessionRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        return yield* child.agent['session/load'](request);
      }).pipe(Effect.orDie),
    'session/new': (request: NewSessionRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        return yield* child.agent['session/new'](request);
      }).pipe(Effect.orDie),
    'session/prompt': (request: PromptRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        return yield* child.agent['session/prompt'](request);
      }).pipe(Effect.orDie),
    'session/resume': () => Effect.succeed({}),
    'session/set_config_option': (request: SetSessionConfigOptionRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        return yield* child.agent['session/set_config_option'](request);
      }).pipe(Effect.orDie),
    'session/set_mode': (request: SetSessionModeRequest) =>
      Effect.gen(function* () {
        const child = yield* ensureChild;
        return yield* child.agent['session/set_mode'](request);
      }).pipe(Effect.orDie),
  });

export const makeGeminiAcpAgentHandlersLayer = (ensureChild: EnsureGeminiChild): AgentHandlersLayer =>
  AgentRpcs.toLayer(Effect.succeed(makeGeminiAcpAgentHandlerMap(ensureChild)));

/**
 * Memoize a connect Effect into the current Layer Scope (lazy on first run).
 * Caller must already provide ChildProcessSpawner / FileSystem / Path on `connect`.
 */
export const makeLazyEnsureGeminiChild = Effect.fn('makeLazyEnsureGeminiChild')(function* (
  connect: Effect.Effect<GeminiChild, unknown, Scope.Scope>,
) {
  const scope = yield* Scope.Scope;
  return yield* Effect.cached(Scope.provide(scope)(connect));
});

/** Serve-facing Agent handlers Layer with lazy Gemini child connect. */
export const makeGeminiAcpServeHandlersLayer = (
  connect: Effect.Effect<GeminiChild, unknown, Scope.Scope>,
): AgentHandlersLayer =>
  AgentRpcs.toLayer(
    Effect.gen(function* () {
      const ensureChild = yield* makeLazyEnsureGeminiChild(connect);
      return makeGeminiAcpAgentHandlerMap(ensureChild);
    }),
  );

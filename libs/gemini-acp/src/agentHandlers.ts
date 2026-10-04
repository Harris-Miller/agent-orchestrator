import type {
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
import { Effect } from 'effect';

import type { EnsureGeminiChild, GeminiChild } from './geminiChild.ts';
import { rewriteInitializeResponse } from './rewriteInitialize.ts';

const withChild = <A>(
  ensureChild: EnsureGeminiChild,
  use: (child: GeminiChild) => Effect.Effect<A, unknown>,
): Effect.Effect<A> =>
  Effect.gen(function* () {
    const child = yield* ensureChild;
    return yield* use(child);
  }).pipe(Effect.orDie);

/** Agent handler map: cap rewrite + stubs + transparent forward to Gemini child. */
export const makeGeminiAcpAgentHandlerMap = (ensureChild: EnsureGeminiChild) =>
  AgentRpcs.of({
    authenticate: (request: AuthenticateRequest) => withChild(ensureChild, child => child.agent.authenticate(request)),
    initialize: (request: InitializeRequest) =>
      withChild(ensureChild, child => child.agent.initialize(request).pipe(Effect.map(rewriteInitializeResponse))),
    logout: (request: LogoutRequest) => withChild(ensureChild, child => child.agent.logout(request)),
    'session/cancel': (payload: { readonly sessionId: string }) =>
      withChild(ensureChild, child => child.notify('session/cancel', payload)),
    'session/close': () => Effect.succeed({}),
    'session/delete': () => Effect.succeed({}),
    'session/list': () => Effect.succeed({ sessions: [] }),
    'session/load': (request: LoadSessionRequest) =>
      withChild(ensureChild, child => child.agent['session/load'](request)),
    'session/new': (request: NewSessionRequest) => withChild(ensureChild, child => child.agent['session/new'](request)),
    'session/prompt': (request: PromptRequest) =>
      withChild(ensureChild, child => child.agent['session/prompt'](request)),
    'session/resume': () => Effect.succeed({}),
    'session/set_config_option': (request: SetSessionConfigOptionRequest) =>
      withChild(ensureChild, child => child.agent['session/set_config_option'](request)),
    'session/set_mode': (request: SetSessionModeRequest) =>
      withChild(ensureChild, child => child.agent['session/set_mode'](request)),
  });

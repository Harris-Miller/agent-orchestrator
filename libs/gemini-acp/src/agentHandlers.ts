import type {
  AuthenticateRequest,
  CloseSessionRequest,
  DeleteSessionRequest,
  InitializeRequest,
  ListSessionsRequest,
  LoadSessionRequest,
  LogoutRequest,
  NewSessionRequest,
  PromptRequest,
  ResumeSessionRequest,
  SetSessionConfigOptionRequest,
  SetSessionModeRequest,
} from '@libs/effect-acp';
import { AgentRpcs } from '@libs/effect-acp';
import { Effect } from 'effect';

import type { EnsureGeminiChild, GeminiChild } from './geminiChild.ts';
import { rewriteInitializeResponse } from './rewriteInitialize.ts';
import type { LoadedSet } from './sessionLifecycle.ts';
import {
  isLoaded,
  listRosterSessions,
  markLoaded,
  removeRosterEntry,
  unmarkLoaded,
  upsertRosterEntry,
} from './sessionLifecycle.ts';

const withChild = <A>(
  ensureChild: EnsureGeminiChild,
  use: (child: GeminiChild) => Effect.Effect<A, unknown>,
): Effect.Effect<A> =>
  Effect.gen(function* () {
    const child = yield* ensureChild;
    return yield* use(child);
  }).pipe(Effect.orDie);

/** Agent handler map: cap rewrite + soft lifecycle + transparent forward to Gemini child. */
export const makeGeminiAcpAgentHandlerMap = (ensureChild: EnsureGeminiChild, loaded: LoadedSet) =>
  AgentRpcs.of({
    authenticate: (request: AuthenticateRequest) => withChild(ensureChild, child => child.agent.authenticate(request)),
    initialize: (request: InitializeRequest) =>
      withChild(ensureChild, child => child.agent.initialize(request).pipe(Effect.map(rewriteInitializeResponse))),
    logout: (request: LogoutRequest) => withChild(ensureChild, child => child.agent.logout(request)),
    'session/cancel': (payload: { readonly sessionId: string }) =>
      withChild(ensureChild, child => child.notify('session/cancel', payload)),
    'session/close': (request: CloseSessionRequest) =>
      Effect.gen(function* () {
        if (yield* isLoaded(loaded, request.sessionId)) {
          yield* withChild(ensureChild, child => child.notify('session/cancel', { sessionId: request.sessionId }));
          yield* unmarkLoaded(loaded, request.sessionId);
        }
        return {};
      }),
    'session/delete': (request: DeleteSessionRequest) =>
      Effect.gen(function* () {
        yield* removeRosterEntry(request.sessionId).pipe(Effect.orDie);
        yield* unmarkLoaded(loaded, request.sessionId);
        return {};
      }),
    'session/list': (request: ListSessionsRequest = {}) => listRosterSessions(request.cwd).pipe(Effect.orDie),
    'session/load': (request: LoadSessionRequest) =>
      Effect.gen(function* () {
        const result = yield* withChild(ensureChild, child => child.agent['session/load'](request));
        yield* upsertRosterEntry({ cwd: request.cwd, sessionId: request.sessionId }).pipe(Effect.orDie);
        yield* markLoaded(loaded, request.sessionId);
        return result;
      }),
    'session/new': (request: NewSessionRequest) =>
      Effect.gen(function* () {
        const result = yield* withChild(ensureChild, child => child.agent['session/new'](request));
        yield* upsertRosterEntry({ cwd: request.cwd, sessionId: result.sessionId }).pipe(Effect.orDie);
        yield* markLoaded(loaded, result.sessionId);
        return result;
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
        const loadedResult = yield* withChild(ensureChild, child => child.agent['session/load'](loadRequest));
        yield* upsertRosterEntry({ cwd: request.cwd, sessionId: request.sessionId }).pipe(Effect.orDie);
        yield* markLoaded(loaded, request.sessionId);
        return {
          ...(loadedResult.configOptions === undefined ? {} : { configOptions: loadedResult.configOptions }),
          ...(loadedResult.modes === undefined ? {} : { modes: loadedResult.modes }),
        };
      }),
    'session/set_config_option': (request: SetSessionConfigOptionRequest) =>
      withChild(ensureChild, child => child.agent['session/set_config_option'](request)),
    'session/set_mode': (request: SetSessionModeRequest) =>
      withChild(ensureChild, child => child.agent['session/set_mode'](request)),
  });

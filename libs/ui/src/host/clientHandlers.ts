/**
 * ACP Client RPC adapter for a backend harness: turn-correlated session/update,
 * elicitation, permission; stub fs/terminal handlers.
 */
import { ClientRpcs } from '@libs/effect-acp';
import type {
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';
import { Effect } from 'effect';
import type { Tracer } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { sessionIdFromElicitationRequest } from './pendingInteractions.ts';
import { getPromptSpan } from './sessionRpc.ts';

export type ClientHandlerCallbacks = {
  readonly onElicitationCreate: (
    sessionId: string,
    request: CreateElicitationRequestBody,
    resolve: (response: CreateElicitationResponseBody) => void,
  ) => void;
  readonly onPermissionRequest: (
    sessionId: string,
    request: RequestPermissionRequest,
    resolve: (response: RequestPermissionResponse) => void,
  ) => void;
};

const withTurnCorrelatedSpan = <A, E, R>(
  name: string,
  launchTarget: AgentLaunchTarget,
  sessionId: string | undefined,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const parent: Tracer.AnySpan | undefined =
    sessionId !== undefined ? getPromptSpan(launchTarget, sessionId) : undefined;
  return effect.pipe(Effect.withSpan(name, parent !== undefined ? { parent } : { root: true }));
};

export const makeClientHandlers = (
  launchTarget: AgentLaunchTarget,
  onSessionUpdate: (sessionId: string, update: unknown) => void,
  onElicitationCreate: ClientHandlerCallbacks['onElicitationCreate'],
  onPermissionRequest: ClientHandlerCallbacks['onPermissionRequest'],
) =>
  ClientRpcs.toLayer(
    Effect.succeed({
      'elicitation/complete': () => Effect.void,
      'elicitation/create': (request: CreateElicitationRequestBody) => {
        const sessionId = sessionIdFromElicitationRequest(request);
        return withTurnCorrelatedSpan(
          'elicitation/create',
          launchTarget,
          sessionId,
          Effect.gen(function* () {
            if (sessionId === undefined) {
              yield* Effect.logWarning('elicitation/create missing session id; cancelling');
              return { action: 'cancel' as const };
            }
            yield* Effect.logInfo('elicitation/create awaiting UI', sessionId);
            return yield* Effect.promise(
              () =>
                new Promise<CreateElicitationResponseBody>(resolve => {
                  onElicitationCreate(sessionId, request, resolve);
                }),
            );
          }),
        );
      },
      'fs/read_text_file': () => Effect.succeed({ content: '' }),
      'fs/write_text_file': () => Effect.succeed({}),
      'session/request_permission': (request: RequestPermissionRequest) =>
        withTurnCorrelatedSpan(
          'session/request_permission',
          launchTarget,
          request.sessionId,
          Effect.gen(function* () {
            yield* Effect.logInfo('session/request_permission awaiting UI', request.sessionId);
            return yield* Effect.promise(
              () =>
                new Promise<RequestPermissionResponse>(resolve => {
                  onPermissionRequest(request.sessionId, request, resolve);
                }),
            );
          }),
        ),
      'session/update': payload =>
        withTurnCorrelatedSpan(
          'session/update',
          launchTarget,
          payload.sessionId,
          Effect.sync(() => {
            onSessionUpdate(payload.sessionId, payload.update);
          }),
        ),
      'terminal/create': () => Effect.succeed({ terminalId: 'stub-terminal' }),
      'terminal/kill': () => Effect.succeed({}),
      'terminal/output': () => Effect.succeed({ output: '', truncated: false }),
      'terminal/release': () => Effect.succeed({}),
      'terminal/wait_for_exit': () => Effect.succeed({ exitCode: 0, signal: null }),
    }),
  );

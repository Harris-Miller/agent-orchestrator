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
import { Clock, Effect, identity } from 'effect';

import {
  elicitationTelemetry,
  PARENT_SESSION_ATTRIBUTE,
  permissionTelemetry,
  sessionUpdateTelemetry,
  summarizeSessionUpdate,
} from './acpTelemetry.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { sessionIdFromElicitationRequest } from './pendingInteractions.ts';
import { recordAwaitingUser, recordSessionUpdate, recordToolCall } from './promptTurnTelemetry.ts';
import { getPromptTurn } from './sessionRpc.ts';

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

export const withTurnCorrelatedSpan = <A, E, R>(
  name: string,
  launchTarget: AgentLaunchTarget,
  sessionId: string | undefined,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const parent = sessionId !== undefined ? getPromptTurn(launchTarget, sessionId)?.span : undefined;
  // A Spawned subagent session's turn names its parent session; the spans and logs it correlates carry it too.
  const parentSessionId =
    parent !== undefined && 'attributes' in parent ? parent.attributes.get(PARENT_SESSION_ATTRIBUTE) : undefined;
  return effect.pipe(
    parentSessionId === undefined ? identity : Effect.annotateLogs(PARENT_SESSION_ATTRIBUTE, parentSessionId),
    Effect.withSpan(name, {
      ...(parent !== undefined ? { parent } : { root: true }),
      ...(sessionId !== undefined
        ? {
            attributes: {
              'acp.agent': launchTarget,
              'acp.sessionId': sessionId,
              ...(parentSessionId === undefined ? {} : { [PARENT_SESSION_ATTRIBUTE]: parentSessionId }),
            },
          }
        : {}),
    }),
  );
};

/** Run `wait` (a request waiting on the user) with the turn's silence clock paused. */
const awaitingUser = Effect.fnUntraced(function* <A>(
  launchTarget: AgentLaunchTarget,
  sessionId: string,
  wait: Effect.Effect<A>,
) {
  const turn = getPromptTurn(launchTarget, sessionId);
  if (turn === undefined) {
    return yield* wait;
  }
  recordAwaitingUser(turn, 1, yield* Clock.currentTimeMillis);
  return yield* wait.pipe(
    Effect.ensuring(
      Effect.flatMap(Clock.currentTimeMillis, nowMs =>
        Effect.sync(() => {
          recordAwaitingUser(turn, -1, nowMs);
        }),
      ),
    ),
  );
});

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
            yield* Effect.annotateCurrentSpan(elicitationTelemetry(request));
            yield* Effect.logInfo('elicitation/create awaiting UI', sessionId, elicitationTelemetry(request));
            const response = yield* awaitingUser(
              launchTarget,
              sessionId,
              Effect.promise(
                () =>
                  new Promise<CreateElicitationResponseBody>(resolve => {
                    onElicitationCreate(sessionId, request, resolve);
                  }),
              ),
            );
            const outcome = elicitationTelemetry(request, response);
            yield* Effect.annotateCurrentSpan(outcome);
            yield* Effect.logInfo('elicitation/create answered', sessionId, outcome);
            return response;
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
            yield* Effect.annotateCurrentSpan(permissionTelemetry(request));
            yield* Effect.logInfo(
              'session/request_permission awaiting UI',
              request.sessionId,
              permissionTelemetry(request),
            );
            const response = yield* awaitingUser(
              launchTarget,
              request.sessionId,
              Effect.promise(
                () =>
                  new Promise<RequestPermissionResponse>(resolve => {
                    onPermissionRequest(request.sessionId, request, resolve);
                  }),
              ),
            );
            const outcome = permissionTelemetry(request, response);
            yield* Effect.annotateCurrentSpan(outcome);
            yield* Effect.logInfo('session/request_permission answered', request.sessionId, outcome);
            return response;
          }),
        ),
      'session/update': payload =>
        withTurnCorrelatedSpan(
          'session/update',
          launchTarget,
          payload.sessionId,
          Effect.gen(function* () {
            const summary = summarizeSessionUpdate(payload.update);
            yield* Effect.annotateCurrentSpan(sessionUpdateTelemetry(summary));
            const turn = getPromptTurn(launchTarget, payload.sessionId);
            if (turn !== undefined) {
              recordSessionUpdate(turn, summary, yield* Clock.currentTimeMillis);
              yield* recordToolCall(turn, payload.sessionId, summary);
            }
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

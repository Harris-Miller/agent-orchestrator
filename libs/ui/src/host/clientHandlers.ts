/**
 * ACP Client RPC adapter for a backend harness: turn-correlated session/update,
 * elicitation, permission, real fs text-file handlers over the Host `EditorFiles` service; stub terminal handlers.
 */
import type { EditorFiles } from '@lib/context-services';
import { ClientRpcs, makeAcpError } from '@lib/effect-acp';
import type {
  AcpError,
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  ReadTextFileRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  WriteTextFileRequest,
} from '@lib/effect-acp';
import { Clock, Effect, Predicate } from 'effect';
import { ACP_PARENT_SESSION_ID, sessionAttributes } from '@lib/hub/telemetryKeys';

import {
  elicitationTelemetry,
  permissionTelemetry,
  sessionUpdateTelemetry,
  summarizeSessionUpdate,
} from './acpTelemetry.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { sessionIdFromElicitationRequest } from './pendingInteractions.ts';
import { recordAwaitingUser, recordSessionUpdate, recordToolCall } from './promptTurnTelemetry.ts';
import { getPromptTurn } from './sessionRpc.ts';
import { annotateLaunchTargetLogs, annotateSessionLogs } from './sessionTelemetry.ts';

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
  const parentAttribute =
    parent !== undefined && 'attributes' in parent ? parent.attributes.get(ACP_PARENT_SESSION_ID) : undefined;
  const parentSessionId = Predicate.isString(parentAttribute) ? parentAttribute : undefined;
  return effect.pipe(
    sessionId === undefined
      ? annotateLaunchTargetLogs(launchTarget)
      : annotateSessionLogs(launchTarget, sessionId, parentSessionId),
    Effect.withSpan(name, {
      ...(parent !== undefined ? { parent } : { root: true }),
      ...(sessionId !== undefined
        ? {
            attributes: sessionAttributes(launchTarget, sessionId, parentSessionId),
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

const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;
const invalidParams = (message: string): AcpError => makeAcpError(-32602, message);

/** Fails with the ACP error for a Host that cannot serve editor files. */
const requireEditorFiles = (editorFiles: EditorFiles): Effect.Effect<void, AcpError> =>
  editorFiles.supported ? Effect.void : Effect.fail(makeAcpError(-32601, 'Method not supported'));

const requireAbsolutePath = (path: string): Effect.Effect<void, AcpError> =>
  ABSOLUTE_PATH.test(path) ? Effect.void : Effect.fail(invalidParams('Path must be absolute'));

/** The Host's failure text can name the path (Private data): the Agent gets a generic message. */
const editorFilesError = (): AcpError => makeAcpError(-32603, 'Editor file access failed');

export const makeClientHandlers = (
  launchTarget: AgentLaunchTarget,
  editorFiles: EditorFiles,
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
            yield* Effect.logInfo('elicitation/create awaiting UI').pipe(
              Effect.annotateLogs(elicitationTelemetry(request)),
            );
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
            yield* Effect.logInfo('elicitation/create answered').pipe(Effect.annotateLogs(outcome));
            return response;
          }),
        );
      },
      'fs/read_text_file': (request: ReadTextFileRequest) =>
        withTurnCorrelatedSpan(
          'fs/read_text_file',
          launchTarget,
          request.sessionId,
          Effect.gen(function* () {
            yield* requireEditorFiles(editorFiles);
            yield* requireAbsolutePath(request.path);
            const { limit, line } = request;
            if (line != null && (!Number.isInteger(line) || line < 1)) {
              return yield* Effect.fail(invalidParams('Invalid line'));
            }
            if (limit != null && (!Number.isInteger(limit) || limit < 0)) {
              return yield* Effect.fail(invalidParams('Invalid limit'));
            }
            const content = yield* editorFiles
              .readText(request.path, {
                ...(line == null ? {} : { line }),
                ...(limit == null ? {} : { limit }),
              })
              .pipe(Effect.mapError(editorFilesError));
            yield* Effect.annotateCurrentSpan({
              'fs.content_length': content.length,
              'fs.windowed': line != null || limit != null,
            });
            return { content };
          }),
        ),
      'fs/write_text_file': (request: WriteTextFileRequest) =>
        withTurnCorrelatedSpan(
          'fs/write_text_file',
          launchTarget,
          request.sessionId,
          Effect.gen(function* () {
            yield* requireEditorFiles(editorFiles);
            yield* requireAbsolutePath(request.path);
            yield* Effect.annotateCurrentSpan({ 'fs.content_length': request.content.length });
            yield* editorFiles.writeText(request.path, request.content).pipe(Effect.mapError(editorFilesError));
            return {};
          }),
        ),
      'session/request_permission': (request: RequestPermissionRequest) =>
        withTurnCorrelatedSpan(
          'session/request_permission',
          launchTarget,
          request.sessionId,
          Effect.gen(function* () {
            yield* Effect.annotateCurrentSpan(permissionTelemetry(request));
            yield* Effect.logInfo('session/request_permission awaiting UI').pipe(
              Effect.annotateLogs(permissionTelemetry(request)),
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
            yield* Effect.logInfo('session/request_permission answered').pipe(Effect.annotateLogs(outcome));
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

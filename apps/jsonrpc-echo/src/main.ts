import { BunRuntime, BunStdio } from '@effect/platform-bun';
import { AcpError, AgentRpcs, clientSupportsFormElicitation, serveAcpAgent } from '@libs/effect-acp';
import type { AcpClientConnection, TransportError } from '@libs/effect-acp';
import { Effect, Ref } from 'effect';

import {
  echoAvailableCommandsUpdate,
  echoInitializeResponse,
  echoSessionLoadResponse,
  echoSessionNewResponse,
  echoSetConfigOptionResponse,
} from './bootstrapResponses.ts';
import { resolveFixtureName, resolveFixtureUpdates } from './fixtures.ts';
import { runElicitationFormScenario, runElicitationNoCapScenario, runPermissionToolScenario } from './scenarios.ts';

type EchoSession = {
  active: boolean;
  chatUpdates: unknown[];
  cwd: string;
  modeId: string;
  modelId: string;
  reasoningEffortId: string;
  sessionId: string;
};

type Notify = (tag: string, payload: unknown) => Effect.Effect<void, TransportError>;

const methodNotFound = (method: string) =>
  Effect.fail(
    AcpError.make({
      code: -32601,
      message: `Method not found: ${method}`,
    }),
  );

const sessionNotFound = (sessionId: string) =>
  Effect.fail(
    AcpError.make({
      code: -32602,
      message: `Session not found: ${sessionId}`,
    }),
  );

const makeHandlers = (_client: AcpClientConnection, notify: Notify) =>
  AgentRpcs.toLayer(
    Effect.gen(function* () {
      const initialized = yield* Ref.make(false);
      const formElicitationSupported = yield* Ref.make(false);
      const sessions = yield* Ref.make(new Map<string, EchoSession>());

      const getSession = (sessionId: string) =>
        Effect.gen(function* () {
          const store = yield* Ref.get(sessions);
          const session = store.get(sessionId);
          if (session === undefined) {
            return yield* sessionNotFound(sessionId);
          }
          return session;
        });

      const notifySessionUpdate = (session: EchoSession, update: unknown) =>
        Effect.gen(function* () {
          session.chatUpdates.push(update);
          yield* notify('session/update', {
            sessionId: session.sessionId,
            update,
          }).pipe(Effect.orDie);
        });

      return {
        authenticate: () => methodNotFound('authenticate'),
        initialize: ({ clientCapabilities, protocolVersion }) =>
          Effect.gen(function* () {
            if (yield* Ref.get(initialized)) {
              return yield* Effect.fail(
                AcpError.make({
                  code: -32600,
                  message: 'Already initialized',
                }),
              );
            }

            const supportsForm = clientSupportsFormElicitation(clientCapabilities);

            yield* Effect.log(`Initializing... formElicitation=${String(supportsForm)}`);
            yield* Ref.set(formElicitationSupported, supportsForm);
            yield* Ref.set(initialized, true);
            return echoInitializeResponse(protocolVersion);
          }),
        logout: () => methodNotFound('logout'),
        'session/cancel': () => Effect.void,
        'session/close': ({ sessionId }) =>
          Effect.gen(function* () {
            const session = yield* getSession(sessionId);
            session.active = false;
            yield* Effect.log(`Closed session ${sessionId}`);
            return {};
          }),
        'session/delete': ({ sessionId }) =>
          Effect.gen(function* () {
            const store = yield* Ref.get(sessions);
            if (!store.has(sessionId)) {
              return yield* sessionNotFound(sessionId);
            }

            const next = new Map(store);
            next.delete(sessionId);
            yield* Ref.set(sessions, next);
            yield* Effect.log(`Deleted session ${sessionId}`);
            return {};
          }),
        'session/list': () =>
          Effect.gen(function* () {
            const store = yield* Ref.get(sessions);
            return {
              sessions: [...store.values()].map(session => ({
                cwd: session.cwd,
                sessionId: session.sessionId,
              })),
            };
          }),
        'session/load': ({ sessionId }) =>
          Effect.gen(function* () {
            const session = yield* getSession(sessionId);
            session.active = true;
            yield* Effect.log(`Loading session ${sessionId}`);

            for (const update of session.chatUpdates) {
              yield* notify('session/update', {
                sessionId: session.sessionId,
                update,
              }).pipe(Effect.orDie);
            }

            return echoSessionLoadResponse(session.modeId, session.modelId, session.reasoningEffortId);
          }),
        'session/new': ({ cwd }) =>
          Effect.gen(function* () {
            const sessionId = crypto.randomUUID();
            yield* Effect.log(`Creating session ${sessionId}...`);

            const session: EchoSession = {
              active: true,
              chatUpdates: [],
              cwd,
              modeId: 'default',
              modelId: 'echo-model',
              reasoningEffortId: 'medium',
              sessionId,
            };

            const store = yield* Ref.get(sessions);
            const next = new Map(store);
            next.set(sessionId, session);
            yield* Ref.set(sessions, next);

            const response = echoSessionNewResponse(sessionId);
            yield* notifySessionUpdate(session, echoAvailableCommandsUpdate());
            return response;
          }),
        'session/prompt': ({ prompt, sessionId }) =>
          Effect.gen(function* () {
            const session = yield* getSession(sessionId);
            const fixtureName = resolveFixtureName(prompt);
            yield* Effect.log(`prompt blocks: ${String(prompt.length)} fixture=${fixtureName}`);

            const notifyUpdate = (update: unknown) => notifySessionUpdate(session, update);

            if (fixtureName === 'elicitation-form') {
              const formSupported = yield* Ref.get(formElicitationSupported);
              yield* runElicitationFormScenario(_client, sessionId, formSupported, notifyUpdate);
              return { stopReason: 'end_turn' as const };
            }

            if (fixtureName === 'elicitation-no-cap') {
              yield* runElicitationNoCapScenario(_client, sessionId, notifyUpdate);
              return { stopReason: 'end_turn' as const };
            }

            if (fixtureName === 'permission-tool') {
              yield* runPermissionToolScenario(_client, sessionId, notifyUpdate);
              return { stopReason: 'end_turn' as const };
            }

            const updates = yield* resolveFixtureUpdates(prompt);
            yield* Effect.log(`fixture replay: ${String(updates.length)} updates`);

            for (const update of updates) {
              yield* notifySessionUpdate(session, update);
            }

            return { stopReason: 'end_turn' as const };
          }),
        'session/resume': ({ sessionId }) =>
          Effect.gen(function* () {
            const session = yield* getSession(sessionId);
            session.active = true;
            yield* Effect.log(`Resuming session ${sessionId}`);
            return echoSessionLoadResponse(session.modeId, session.modelId, session.reasoningEffortId);
          }),
        'session/set_config_option': ({ configId, sessionId, value }) =>
          Effect.gen(function* () {
            if (typeof value !== 'string') {
              return yield* Effect.fail(
                AcpError.make({
                  code: -32602,
                  message: 'Only string config values are supported in echo',
                }),
              );
            }

            const session = yield* getSession(sessionId);

            if (configId === 'model') {
              session.modelId = value;
            } else if (configId === 'mode') {
              session.modeId = value;
            } else if (configId === 'reasoning_effort') {
              session.reasoningEffortId = value;
            }

            const update = {
              configOptions: echoSetConfigOptionResponse(configId, value).configOptions,
              sessionUpdate: 'config_option_update' as const,
            };
            yield* notifySessionUpdate(session, update);

            return echoSetConfigOptionResponse(configId, value);
          }),
        'session/set_mode': ({ modeId, sessionId }) =>
          Effect.gen(function* () {
            const session = yield* getSession(sessionId);
            session.modeId = modeId;

            const update = {
              configOptions: echoSetConfigOptionResponse('mode', modeId).configOptions,
              sessionUpdate: 'config_option_update' as const,
            };
            yield* notifySessionUpdate(session, update);

            return {};
          }),
      };
    }),
  );

BunRuntime.runMain(
  serveAcpAgent(makeHandlers).pipe(
    Effect.andThen(() => Effect.never),
    Effect.scoped,
    Effect.provide(BunStdio.layer),
  ),
  {
    disableErrorReporting: true,
  },
);

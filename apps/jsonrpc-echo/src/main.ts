import { BunRuntime, BunStdio } from '@effect/platform-bun';
import { AcpError, AgentRpcs } from '@libs/effect-acp';
import { Effect, Layer, Ref } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import {
  echoAvailableCommandsUpdate,
  echoInitializeResponse,
  echoSessionNewResponse,
  echoSetConfigOptionResponse,
  echoSetModeResponse,
} from './bootstrapResponses.ts';
import { replayFixture } from './fixtures.ts';
import { notifyClient } from './notifyClient.ts';

const ECHO_SESSION_ID = 'echo-session-1';

const methodNotFound = (method: string) =>
  Effect.fail(
    AcpError.make({
      code: -32601,
      message: `Method not found: ${method}`,
    }),
  );

const Handlers = AgentRpcs.toLayer(
  Effect.gen(function* () {
    const initialized = yield* Ref.make(false);
    const currentModeId = yield* Ref.make('default');
    const currentModelId = yield* Ref.make('echo-model');

    return {
      authenticate: () => methodNotFound('authenticate'),
      initialize: ({ protocolVersion }) =>
        Effect.gen(function* () {
          if (yield* Ref.get(initialized)) {
            return yield* Effect.fail(
              AcpError.make({
                code: -32600,
                message: 'Already initialized',
              }),
            );
          }

          yield* Effect.log('Initializing...');
          yield* Ref.set(initialized, true);
          return echoInitializeResponse(protocolVersion);
        }),
      logout: () => methodNotFound('logout'),
      'session/cancel': () => Effect.void,
      'session/close': () => methodNotFound('session/close'),
      'session/delete': () => methodNotFound('session/delete'),
      'session/list': () => methodNotFound('session/list'),
      'session/load': () => methodNotFound('session/load'),
      'session/new': () =>
        Effect.gen(function* () {
          yield* Effect.log('Creating session...');
          const response = echoSessionNewResponse(ECHO_SESSION_ID);
          yield* notifyClient('session/update', {
            sessionId: ECHO_SESSION_ID,
            update: echoAvailableCommandsUpdate(),
          }).pipe(Effect.orDie);
          return response;
        }),
      'session/prompt': ({ prompt, sessionId }) =>
        Effect.gen(function* () {
          yield* Effect.log(`prompt blocks: ${String(prompt.length)}`);
          yield* replayFixture(sessionId, prompt);

          return { stopReason: 'end_turn' as const };
        }),
      'session/resume': () => methodNotFound('session/resume'),
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

          if (configId === 'model') {
            yield* Ref.set(currentModelId, value);
          }

          yield* notifyClient('session/update', {
            sessionId,
            update: {
              configOptions: echoSetConfigOptionResponse(configId, value).configOptions,
              sessionUpdate: 'config_option_update',
            },
          }).pipe(Effect.orDie);

          return echoSetConfigOptionResponse(configId, value);
        }),
      'session/set_mode': ({ modeId, sessionId }) =>
        Effect.gen(function* () {
          yield* Ref.set(currentModeId, modeId);
          yield* notifyClient('session/update', {
            sessionId,
            update: {
              configOptions: echoSetModeResponse(modeId).configOptions,
              sessionUpdate: 'config_option_update',
            },
          }).pipe(Effect.orDie);
          return {};
        }),
    };
  }),
).pipe(Layer.provide(BunStdio.layer));

const Server = RpcServer.layer(AgentRpcs).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcServer.layerProtocolStdio),
  Layer.provide(Layer.succeed(RpcSerialization.RpcSerialization, RpcSerialization.ndJsonRpc())),
  Layer.provide(BunStdio.layer),
);

BunRuntime.runMain(Layer.launch(Server).pipe(Effect.provide(BunStdio.layer)), {
  disableErrorReporting: true,
});

import { BunRuntime, BunStdio } from '@effect/platform-bun';
import { AcpError, AgentRpcs } from '@libs/effect-acp';
import { Effect, Layer, Ref } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

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
          return { protocolVersion };
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
          return { sessionId: ECHO_SESSION_ID };
        }),
      'session/prompt': ({ prompt, sessionId }) =>
        Effect.gen(function* () {
          yield* Effect.log(`prompt blocks: ${String(prompt.length)}`);

          yield* notifyClient('session/update', {
            sessionId,
            update: {
              content: prompt,
              type: 'agent_message',
            },
          }).pipe(Effect.orDie);

          return { stopReason: 'end_turn' as const };
        }),
      'session/resume': () => methodNotFound('session/resume'),
      'session/set_config_option': () => methodNotFound('session/set_config_option'),
      'session/set_mode': () => methodNotFound('session/set_mode'),
    };
  }),
).pipe(Layer.provide(BunStdio.layer));

const Server = RpcServer.layer(AgentRpcs).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcServer.layerProtocolStdio),
  Layer.provide(Layer.succeed(RpcSerialization.RpcSerialization, RpcSerialization.ndJsonRpc())),
  Layer.provide(BunStdio.layer),
);

BunRuntime.runMain(Layer.launch(Server), {
  disableErrorReporting: true,
});

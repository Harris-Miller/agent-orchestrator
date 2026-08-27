import { BunRuntime, BunStdio } from '@effect/platform-bun';
import { Effect, Layer, Ref, Schema } from 'effect';
import { Rpc, RpcGroup, RpcSerialization, RpcServer } from 'effect/unstable/rpc';

/**
 * Where `main.orig.ts` used an Effect.forkChild that added a handler to stdin,
 * which then went through manual parsing and handling of the lines, this version
 * uses Effect.rpc.RpcServer to handle the lines.
 *
 * This version is more concise, portable, and easier to understand, but it is also more
 * complex and less efficient.
 */

// Structs, either predefined or inlined, are used to type the RPCs
export const RpcError = Schema.Struct({
  code: Schema.Number,
  data: Schema.Struct({}),
  message: Schema.String,
});

// These RPCs can define single direction or 2-way Error types are optional.
export class Initialize extends Rpc.make('initialize', {
  error: RpcError,
  payload: Schema.Struct({}),
  success: Schema.Struct({}),
}) {}

export class Message extends Rpc.make('message', {
  payload: Schema.Struct({
    echos: Schema.Array(Schema.String),
  }),
  success: Schema.Struct({
    ok: Schema.Boolean,
  }),
}) {}

// Defining a group is the same as saying "here is an _interface_ that needs to be implemented"
export class EchoRpcs extends RpcGroup.make(Initialize, Message) {}

// `.toLayer()` is one way to define the concrete implementation
// notice that all return object's keys must match the RPCs' names of the group
// Rpc `payload` is the argument, `success` is the return value, and `error` is optional through `Effect.fail`
const Handlers = EchoRpcs.toLayer(
  Effect.gen(function* () {
    const initialized = yield* Ref.make(false);

    return {
      initialize: () =>
        Effect.gen(function* () {
          if (yield* Ref.get(initialized)) {
            yield* Effect.log('Already initialized');
            return yield* Effect.fail(
              RpcError.make({
                code: -32600,
                data: {},
                message: 'Already initialized',
              }),
            );
          }
          yield* Effect.log('Initializing...');
          yield* Ref.set(initialized, true);
          return {};
        }),

      message: ({ echos }) =>
        Effect.gen(function* () {
          yield* Effect.log(`echos: ${echos.join(', ')}`);
          return { ok: true };
        }),
    };
  }),
);

// They the concrete, a Layer in this case, is given to an RpcServer,
// which then has provided the transport protocol layer layerProtocolStdio, which then requires concretes of...
// the serialization layer (ndJsonRpc),
// and stdio (BunStdio.layer)
const Server = RpcServer.layer(EchoRpcs).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcServer.layerProtocolStdio),
  Layer.provide(Layer.succeed(RpcSerialization.RpcSerialization, RpcSerialization.ndJsonRpc())),
  Layer.provide(BunStdio.layer),
);

BunRuntime.runMain(Layer.launch(Server), {
  disableErrorReporting: true, // avoid dumping Effect errors onto the console
});

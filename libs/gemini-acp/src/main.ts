#!/usr/bin/env tsx
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { OSLive } from '@lib/context-services-node';
import { ClientRpcs, connectAcpAgent, serveAcpAgent } from '@libs/effect-acp';
import { Effect, Layer } from 'effect';

import { makeForwardClientHandlerMap } from './forwardClientHandlers.ts';
import { GEMINI_CHILD_COMMAND } from './geminiChild.ts';
import { makeGeminiAcpServeHandlersLayer } from './serveHandlers.ts';

const runtimeLayer = Layer.mergeAll(NodeServices.layer, OSLive);

const program = Effect.gen(function* () {
  yield* serveAcpAgent(parentClient =>
    makeGeminiAcpServeHandlersLayer(
      connectAcpAgent(
        GEMINI_CHILD_COMMAND,
        ClientRpcs.toLayer(Effect.succeed(makeForwardClientHandlerMap(parentClient))),
      ).pipe(Effect.provide(runtimeLayer)),
    ).pipe(Layer.provide(runtimeLayer)),
  );
  return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(runtimeLayer));

NodeRuntime.runMain(program);

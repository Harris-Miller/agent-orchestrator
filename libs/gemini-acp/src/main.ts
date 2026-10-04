#!/usr/bin/env tsx
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { ClientRpcs, connectAcpAgent, serveAcpAgent } from '@libs/effect-acp';
import { Effect } from 'effect';

import { makeForwardClientHandlerMap } from './forwardClientHandlers.ts';
import { GEMINI_CHILD_COMMAND } from './geminiChild.ts';
import { makeGeminiAcpServeHandlersLayer } from './serveHandlers.ts';

const program = Effect.gen(function* () {
  yield* serveAcpAgent(parentClient =>
    makeGeminiAcpServeHandlersLayer(
      connectAcpAgent(
        GEMINI_CHILD_COMMAND,
        ClientRpcs.toLayer(Effect.succeed(makeForwardClientHandlerMap(parentClient))),
      ).pipe(Effect.provide(NodeServices.layer)),
    ),
  );
  return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);

#!/usr/bin/env tsx
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { connectAcpAgent, serveAcpAgent } from '@libs/effect-acp';
import { Effect } from 'effect';

import { makeGeminiAcpServeHandlersLayer } from './agentHandlers.ts';
import { makeForwardClientHandlers } from './forwardClientHandlers.ts';
import { makeGeminiChildCommand } from './geminiChild.ts';

const program = Effect.gen(function* () {
  yield* serveAcpAgent(parentClient =>
    makeGeminiAcpServeHandlersLayer(
      connectAcpAgent(makeGeminiChildCommand(), makeForwardClientHandlers(parentClient)).pipe(
        Effect.provide(NodeServices.layer),
      ),
    ),
  );
  return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);

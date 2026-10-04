#!/usr/bin/env tsx
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { connectAcpAgent, serveAcpAgent } from '@libs/effect-acp';
import type { Scope } from 'effect';
import { Effect } from 'effect';

import type { GeminiChild } from './agentHandlers.ts';
import { makeGeminiAcpServeHandlersLayer } from './agentHandlers.ts';
import { makeForwardClientHandlers } from './forwardClientHandlers.ts';
import { makeGeminiChildCommand } from './geminiChild.ts';

const program = Effect.gen(function* () {
  yield* serveAcpAgent(parentClient =>
    makeGeminiAcpServeHandlersLayer(
      connectAcpAgent(makeGeminiChildCommand(), makeForwardClientHandlers(parentClient)).pipe(
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<GeminiChild, unknown, Scope.Scope>,
    ),
  );
  return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);

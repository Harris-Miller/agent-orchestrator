import { AgentRpcs } from '@libs/effect-acp';
import type { Layer, Scope } from 'effect';
import { Effect } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { makeGeminiAcpAgentHandlerMap } from './agentHandlers.ts';
import type { GeminiChild } from './geminiChild.ts';
import { makeLazyEnsureGeminiChild } from './geminiChild.ts';

type AgentHandlersLayer = Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof AgentRpcs>>>;

/** Serve-facing Agent handlers Layer with lazy Gemini child connect. */
export const makeGeminiAcpServeHandlersLayer = (
  connect: Effect.Effect<GeminiChild, unknown, Scope.Scope>,
): AgentHandlersLayer =>
  AgentRpcs.toLayer(
    Effect.gen(function* () {
      const ensureChild = yield* makeLazyEnsureGeminiChild(connect);
      return makeGeminiAcpAgentHandlerMap(ensureChild);
    }),
  );

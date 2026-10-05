import type { OS } from '@lib/context-services';
import { AgentRpcs } from '@libs/effect-acp';
import type { Layer, Scope } from 'effect';
import { Effect } from 'effect';
import type { FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { makeGeminiAcpAgentHandlerMap } from './agentHandlers.ts';
import type { GeminiChild } from './geminiChild.ts';
import { makeLazyEnsureGeminiChild } from './geminiChild.ts';
import { makeLoadedSet } from './loadedSet.ts';
import { makeSessionConfigStore } from './sessionConfigStore.ts';

type AgentHandlersLayer = Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof AgentRpcs>>, never, FileSystem | OS | Path>;

/** Serve-facing Agent handlers Layer with lazy Gemini child connect. */
export const makeGeminiAcpServeHandlersLayer = (
  connect: Effect.Effect<GeminiChild, unknown, Scope.Scope>,
): AgentHandlersLayer =>
  AgentRpcs.toLayer(
    Effect.gen(function* () {
      const ensureChild = yield* makeLazyEnsureGeminiChild(connect);
      const loaded = yield* makeLoadedSet();
      const configs = yield* makeSessionConfigStore();
      return makeGeminiAcpAgentHandlerMap(ensureChild, loaded, configs);
    }),
  );

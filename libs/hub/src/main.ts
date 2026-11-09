/** Hub process entry (bundled as `hub.mjs`). Normally started detached by `launcher.ts`, never by a client directly. */
import { NodeFileSystem, NodePath, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runHubProcess } from './hubProcess.ts';
import { DEFAULT_HUB_PORT } from './protocol.ts';

const program = Effect.gen(function* () {
  const hub = yield* runHubProcess({
    home: process.env['HOA_HOME'] ?? join(homedir(), '.hoa'),
    idleGrace: '30 seconds',
    port: Number(process.env['HOA_HUB_PORT'] ?? DEFAULT_HUB_PORT),
  });
  yield* hub.awaitIdle;
  yield* Effect.logInfo('Hub idle; exiting');
}).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)));

NodeRuntime.runMain(program);

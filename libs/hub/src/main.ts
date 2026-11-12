/**
 * Hub process entry (bundled as `hub.mjs`): `hub.mjs [--port <n>] [--idle-grace-ms <ms>]`. Normally started detached by
 * `launcher.ts`, never by a client directly.
 */
import { NodeFileSystem, NodePath, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { parseArgs } from 'node:util';

import { hubHome } from './home.ts';
import { runHubProcess } from './hubProcess.ts';
import { DEFAULT_HUB_PORT } from './protocol.ts';

const { values } = parseArgs({
  options: { 'idle-grace-ms': { default: '30000', type: 'string' }, port: { type: 'string' } },
});

const program = Effect.gen(function* () {
  const hub = yield* runHubProcess({
    home: hubHome(),
    idleGrace: Number(values['idle-grace-ms']),
    port: values.port === undefined ? DEFAULT_HUB_PORT : Number(values.port),
  });
  yield* hub.awaitIdle;
  yield* Effect.logInfo('Hub idle; exiting');
}).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)));

NodeRuntime.runMain(program);

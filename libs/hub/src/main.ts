/**
 * Hub process entry (bundled as `hub.mjs`): `hub.mjs [--port <n>] [--idle-grace-ms <ms>] [--build-target dev|prod] [--service-version <v>]`. Normally started detached by
 * `launcher.ts`, never by a client directly.
 */
import { NodeFileSystem, NodePath, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { parseArgs } from 'node:util';

import { hubHome } from './home.ts';
import { hubServiceVersion, makeHubObservabilityLive } from './observability.ts';
import { runHubProcess } from './hubProcess.ts';
import { DEFAULT_HUB_PORT } from './protocol.ts';

const { values } = parseArgs({
  options: {
    'build-target': { type: 'string' },
    'idle-grace-ms': { default: '30000', type: 'string' },
    port: { type: 'string' },
    'service-version': { type: 'string' },
  },
});

/** Fails closed: anything but an explicit `dev` is prod, so a missing or garbled flag never enables export. */
const buildTarget = values['build-target'] === 'dev' ? 'dev' : 'prod';

const program = Effect.gen(function* () {
  const hub = yield* runHubProcess({
    home: hubHome(),
    idleGrace: Number(values['idle-grace-ms']),
    port: values.port === undefined ? DEFAULT_HUB_PORT : Number(values.port),
  });
  yield* hub.awaitIdle;
  yield* Effect.logInfo('Hub idle; exiting');
}).pipe(
  Effect.scoped,
  Effect.provide(
    Layer.mergeAll(
      NodeFileSystem.layer,
      NodePath.layer,
      makeHubObservabilityLive(buildTarget, hubServiceVersion(values['service-version'])),
    ),
  ),
);

NodeRuntime.runMain(program);

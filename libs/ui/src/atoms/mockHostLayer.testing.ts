import { BundledResource, Clipboard, FileDialog, OpenFile, OpenUrl, OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { FetchHttpClient } from 'effect/http';
import { layer as posixPathLayer } from 'effect/Path';
import { ChildProcessSpawner } from 'effect/process';

export const mockHostLayer = Layer.mergeAll(
  Layer.succeed(BundledResource, {
    resolve: (resourcePath: string) => Effect.succeed(`/resources/${resourcePath}`),
  }),
  Layer.succeed(Clipboard, {
    readText: () => Effect.succeed(''),
    writeText: () => Effect.void,
  }),
  Layer.succeed(FileDialog, {
    pickFiles: () => Effect.succeed([]),
  }),
  Layer.succeed(OpenUrl, {
    open: () => Effect.void,
  }),
  Layer.succeed(OpenFile, { supported: false, open: () => Effect.void }),
  Layer.succeed(OS, {
    arch: () => 'arm64',
    cwd: () => '/home/operator',
    env: () => ({}),
    homedir: () => '/home/operator',
    platform: () => 'linux',
  }),
  layerNoop({}),
  posixPathLayer,
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die(new Error('spawner unused'))),
  ),
  FetchHttpClient.layer,
);

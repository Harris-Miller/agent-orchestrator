import { AtomicFile, BundledResource, Clipboard, FileDialog, OpenFile, OpenUrl, OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { FetchHttpClient } from 'effect/http';
import { layer as posixPathLayer } from 'effect/Path';
import { ChildProcessSpawner } from 'effect/process';

/** Host without editor support: file links render inert. */
export const mockOpenFileLayer = Layer.succeed(OpenFile, {
  open: () => Effect.void,
  openImageData: () => Effect.void,
  supported: false,
});

/** Atomic replace that publishes nothing (tests that don't observe provider state). */
export const mockAtomicFileLayer = Layer.succeed(AtomicFile, {
  replaceFileString: () => Effect.void,
});

export const mockHostLayer = Layer.mergeAll(
  mockAtomicFileLayer,
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
  mockOpenFileLayer,
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

import type { HostServices } from '@lib/context-services';
import {
  AtomicFile,
  BundledResource,
  Clipboard,
  FileDialog,
  Notifier,
  OpenFile,
  OpenUrl,
  OS,
} from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { FetchHttpClient } from 'effect/http';
import { layer as posixPathLayer } from 'effect/Path';
import { ChildProcessSpawner } from 'effect/process';

/**
 * The one full mock of every Host services member for libs/ui tests. Override a member by merging a
 * layer after it (`Layer.merge(mockHostLayer, myFsLayer)`; the later layer wins).
 */
export const mockHostLayer: Layer.Layer<HostServices> = Layer.mergeAll(
  Layer.succeed(AtomicFile, {
    replaceFileString: () => Effect.void,
  }),
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
  // Never raises anything; window reported focused.
  Layer.succeed(Notifier, {
    isWindowFocused: Effect.succeed(true),
    notify: () => Effect.void,
    supported: 'os',
  }),
  Layer.succeed(OpenUrl, {
    open: () => Effect.void,
  }),
  // Host without editor support: file links render inert.
  Layer.succeed(OpenFile, {
    open: () => Effect.void,
    openImageData: () => Effect.void,
    supported: false,
  }),
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

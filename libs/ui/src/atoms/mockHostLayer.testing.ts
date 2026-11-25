import type { HostServices } from '@lib/context-services';
import {
  AnalyticsNoopLive,
  AtomicFile,
  BundledResource,
  Clipboard,
  EditorFiles,
  EditorFilesFailed,
  FileDialog,
  Notifier,
  OpenFile,
  OpenUrl,
  OS,
  VscodeExtension,
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
  AnalyticsNoopLive,
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
    playSound: Effect.void,
    notify: () => Effect.void,
    supported: 'os',
  }),
  Layer.succeed(OpenUrl, {
    open: () => Effect.void,
  }),
  // Host without editor support: file links render inert.
  Layer.succeed(EditorFiles, {
    readText: () => Effect.fail(new EditorFilesFailed({ message: 'EditorFiles unsupported' })),
    supported: false,
    writeText: () => Effect.fail(new EditorFilesFailed({ message: 'EditorFiles unsupported' })),
  }),
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
  // Host without VS Code extension install: the feature is hidden.
  Layer.succeed(VscodeExtension, {
    bundled: Effect.succeed(undefined),
    detect: Effect.succeed({ _tag: 'NotFound' as const }),
    installBundled: Effect.void,
    installedVersion: Effect.succeed(undefined),
    supported: false,
  }),
  layerNoop({}),
  posixPathLayer,
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die(new Error('spawner unused'))),
  ),
  FetchHttpClient.layer,
);

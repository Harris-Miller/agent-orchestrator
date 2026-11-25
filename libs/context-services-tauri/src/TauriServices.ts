import { buildTarget } from '@lib/context-services';
import type { HostServices } from '@lib/context-services';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { makeAnalyticsLive } from '@lib/analytics-posthog';
import { AtomicFileLive } from './AtomicFileLive.ts';
import { BundledResourceLive } from './BundledResourceLive.ts';
import { ChildProcessSpawnerLive } from './ChildProcessSpawnerLive.ts';
import { ClipboardLive } from './ClipboardLive.ts';
import { ConfigProviderLive } from './ConfigProviderLive.ts';
import { EditorFilesLive } from './EditorFilesLive.ts';
import { FileDialogLive } from './FileDialogLive.ts';
import { FileSystemLive } from './FileSystemLive.ts';
import { NotifierLive } from './NotifierLive.ts';
import { ObservabilityLive } from './ObservabilityLive.ts';
import { OpenUrlLive } from './OpenUrlLive.ts';
import { OpenFileLive } from './OpenFileLive.ts';
import { OSLive } from './OSLive.ts';
import { PathLive } from './PathLive.ts';
import { TauriFetchLive } from './TauriFetchLive.ts';
import { VscodeExtensionLive } from './VscodeExtensionLive.ts';

/**
 * Aggregate Tauri platform services analogous to `@effect/platform-node`'s
 * `NodeServices.layer`, without Crypto / Stdio / Terminal.
 *
 * Also installs a host {@link ConfigProvider} (Reference — not listed in the
 * Layer ROut type) via {@link ConfigProviderLive}, and OTLP export via
 * {@link ObservabilityLive} in dev builds when host `OTEL_*` config enables it. Analytics is the PostHog Live in dev
 * builds with a build-time `POSTHOG_PROJECT_TOKEN` set, else a no-op.
 */
export type TauriServices = HostServices;

/**
 * Provides AtomicFile, BundledResource, Clipboard, EditorFiles, FileDialog, Notifier, OpenUrl, OpenFile, OS, Path, VscodeExtension, FileSystem, ChildProcessSpawner, and
 * ConfigProvider backed by Tauri plugins / host_process_info.
 */
export const layer: Layer.Layer<TauriServices> = Layer.mergeAll(
  makeAnalyticsLive(buildTarget, 'desktop').pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(TauriFetchLive),
    Layer.provide(ConfigProviderLive.pipe(Layer.provide(OSLive))),
    Layer.provide(OSLive),
  ),
  AtomicFileLive,
  BundledResourceLive,
  ClipboardLive,
  ConfigProviderLive,
  ChildProcessSpawnerLive,
  EditorFilesLive,
  FileDialogLive,
  FileSystemLive,
  NotifierLive,
  OpenUrlLive,
  OpenFileLive,
  PathLive,
  VscodeExtensionLive,
  FetchHttpClient.layer.pipe(Layer.provide(TauriFetchLive)),
).pipe(
  Layer.provideMerge(OSLive),
  Layer.provideMerge(
    ObservabilityLive.pipe(
      Layer.provide(TauriFetchLive),
      Layer.provide(ConfigProviderLive.pipe(Layer.provide(OSLive))),
    ),
  ),
);

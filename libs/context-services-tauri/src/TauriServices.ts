import type { HostServices } from '@lib/context-services';
import { Layer } from 'effect';

import { BundledResourceLive } from './BundledResourceLive.ts';
import { ChildProcessSpawnerLive } from './ChildProcessSpawnerLive.ts';
import { ClipboardLive } from './ClipboardLive.ts';
import { ConfigProviderLive } from './ConfigProviderLive.ts';
import { FileSystemLive } from './FileSystemLive.ts';
import { ObservabilityLive } from './ObservabilityLive.ts';
import { OSLive } from './OSLive.ts';
import { PathLive } from './PathLive.ts';
import { TauriFetchLive } from './TauriFetchLive.ts';

/**
 * Aggregate Tauri platform services analogous to `@effect/platform-node`'s
 * `NodeServices.layer`, without Crypto / Stdio / Terminal.
 *
 * Also installs a host {@link ConfigProvider} (Reference — not listed in the
 * Layer ROut type) via {@link ConfigProviderLive}, and OTLP export via
 * {@link ObservabilityLive} when host `OTEL_*` config enables it.
 */
export type TauriServices = HostServices;

/**
 * Provides BundledResource, Clipboard, OS, Path, FileSystem, ChildProcessSpawner, and
 * ConfigProvider backed by Tauri plugins / host_process_info.
 */
export const layer: Layer.Layer<TauriServices> = Layer.mergeAll(
  BundledResourceLive,
  ClipboardLive,
  ConfigProviderLive,
  ChildProcessSpawnerLive,
  FileSystemLive,
  PathLive,
).pipe(
  Layer.provideMerge(OSLive),
  Layer.provideMerge(
    ObservabilityLive.pipe(
      Layer.provide(TauriFetchLive),
      Layer.provide(ConfigProviderLive.pipe(Layer.provide(OSLive))),
    ),
  ),
);

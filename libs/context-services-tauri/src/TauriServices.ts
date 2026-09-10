import type { OS } from '@lib/context-services';
import { Layer } from 'effect';
import type { FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner';

import { ChildProcessSpawnerLive } from './ChildProcessSpawnerLive.ts';
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
export type TauriServices = ChildProcessSpawner | FileSystem | OS | Path;

/**
 * Provides OS, Path, FileSystem, ChildProcessSpawner, and ConfigProvider
 * backed by Tauri plugins / host_process_info.
 */
export const layer: Layer.Layer<TauriServices> = Layer.mergeAll(
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

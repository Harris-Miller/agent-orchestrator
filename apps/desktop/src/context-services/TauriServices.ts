import type { OS } from '@lib/context-services';
import { Layer } from 'effect';
import type { FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner';

import { ChildProcessSpawnerLive } from './ChildProcessSpawnerLive.ts';
import { FileSystemLive } from './FileSystemLive.ts';
import { HostConfigProviderLive } from './HostConfigProviderLive.ts';
import { OSLive } from './OSLive.ts';
import { PathLive } from './PathLive.ts';

/**
 * Aggregate Tauri platform services analogous to `@effect/platform-node`'s
 * `NodeServices.layer`, without Crypto / Stdio / Terminal.
 *
 * Also installs a host {@link ConfigProvider} (Reference — not listed in the
 * Layer ROut type) via {@link HostConfigProviderLive}.
 */
export type TauriServices = ChildProcessSpawner | FileSystem | OS | Path;

/**
 * Provides OS, Path, FileSystem, ChildProcessSpawner, and ConfigProvider
 * backed by Tauri plugins / host_process_info.
 */
export const layer: Layer.Layer<TauriServices> = Layer.mergeAll(
  HostConfigProviderLive,
  ChildProcessSpawnerLive,
  FileSystemLive,
  PathLive,
).pipe(Layer.provideMerge(OSLive));

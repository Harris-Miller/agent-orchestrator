import type { HostServices } from '@lib/context-services';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { makeBundledResourceLive } from './BundledResourceLive.ts';
import { makeChildProcessSpawnerLive } from './ChildProcessSpawnerLive.ts';
import { ClipboardLive } from './ClipboardLive.ts';
import { ConfigProviderLive } from './ConfigProviderLive.ts';
import { makeExtensionFetchLive } from './ExtensionFetchLive.ts';
import { makeFileDialogLive } from './FileDialogLive.ts';
import { makeFileSystemLive } from './FileSystemLive.ts';
import { ObservabilityLive } from './ObservabilityLive.ts';
import { makeOsSnapshotLive } from './OsSnapshotLive.ts';
import { PathLive } from './PathLive.ts';
import { IpcClient } from './protocol/ipcClient.ts';
import type { IpcPort } from './protocol/port.ts';
import { acquireVsCodeApiPort } from './protocol/vscodeApiPort.ts';

type HostServicesOptions = { readonly client: IpcClient } | { readonly port: IpcPort };

/**
 * Build the Host services Live for the VS Code webview.
 *
 * Provides the portable Host seam, plus ConfigProvider / Observability
 * composition extras (outside the portable Seam) when host `OTEL_*` enables export.
 *
 * Calls {@link acquireVsCodeApi} unless a port or shared client is injected.
 */
/* eslint-disable @typescript-eslint/unified-signatures -- AGENTS.md: exclusive port|client via overloads */
export function makeHostServicesLive(): Layer.Layer<HostServices>;
export function makeHostServicesLive(options: { readonly port: IpcPort }): Layer.Layer<HostServices>;
export function makeHostServicesLive(options: { readonly client: IpcClient }): Layer.Layer<HostServices>;
/* eslint-enable @typescript-eslint/unified-signatures */
export function makeHostServicesLive(options?: HostServicesOptions): Layer.Layer<HostServices> {
  const client =
    options === undefined
      ? new IpcClient(acquireVsCodeApiPort())
      : 'client' in options
        ? options.client
        : new IpcClient(options.port);

  const osLive = makeOsSnapshotLive(client);

  const fetchLive = makeExtensionFetchLive(client);

  return Layer.mergeAll(
    makeBundledResourceLive(client),
    makeChildProcessSpawnerLive(client),
    ClipboardLive,
    ConfigProviderLive,
    makeFileDialogLive(client),
    makeFileSystemLive(client),
    PathLive,
    FetchHttpClient.layer.pipe(Layer.provide(fetchLive)),
  ).pipe(
    Layer.provideMerge(osLive),
    Layer.provideMerge(
      ObservabilityLive.pipe(Layer.provide(fetchLive), Layer.provide(ConfigProviderLive.pipe(Layer.provide(osLive)))),
    ),
  );
}

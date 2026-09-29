import type { HostServices } from '@lib/context-services';
import { Layer } from 'effect';

import { makeBundledResourceLive } from './BundledResourceLive.ts';
import { makeChildProcessSpawnerLive } from './ChildProcessSpawnerLive.ts';
import { ClipboardLive } from './ClipboardLive.ts';
import { makeFileSystemLive } from './FileSystemLive.ts';
import { makeOsSnapshotLive } from './OsSnapshotLive.ts';
import { PathLive } from './PathLive.ts';
import { IpcClient } from './protocol/ipcClient.ts';
import type { IpcPort } from './protocol/port.ts';
import { acquireVsCodeApiPort } from './protocol/vscodeApiPort.ts';

type HostServicesOptions = { readonly client: IpcClient } | { readonly port: IpcPort };

/**
 * Build the six-tag Host services Live for the VS Code webview.
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

  return Layer.mergeAll(
    makeBundledResourceLive(client),
    makeChildProcessSpawnerLive(client),
    ClipboardLive,
    makeFileSystemLive(client),
    PathLive,
  ).pipe(Layer.provideMerge(makeOsSnapshotLive(client)));
}

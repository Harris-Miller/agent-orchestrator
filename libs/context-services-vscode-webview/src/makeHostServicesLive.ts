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

/**
 * Build the six-tag Host services Live for the VS Code webview.
 *
 * Calls {@link acquireVsCodeApi} unless an {@link IpcPort} is injected (tests).
 */
export const makeHostServicesLive = (port?: IpcPort): Layer.Layer<HostServices> => {
  const resolvedPort = port ?? acquireVsCodeApiPort();
  const client = new IpcClient(resolvedPort);

  return Layer.mergeAll(
    makeBundledResourceLive(client),
    makeChildProcessSpawnerLive(client),
    ClipboardLive,
    makeFileSystemLive(client),
    PathLive,
  ).pipe(Layer.provideMerge(makeOsSnapshotLive(client)));
};

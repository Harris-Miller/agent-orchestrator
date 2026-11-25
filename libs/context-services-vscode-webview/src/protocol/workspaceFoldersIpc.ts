import { Effect } from 'effect';

import type { IpcClient, IpcClientError } from './ipcClient.ts';

/**
 * The Workspace folders: absolute paths (file-scheme only; empty when none) and, for a saved
 * workspace, the absolute path of its workspace file (omitted for untitled and non-file workspaces).
 */
export interface WorkspaceFolders {
  readonly paths: readonly string[];
  readonly workspaceFile?: string;
}

/** Request the Workspace folders and the optional workspace file path. */
export const requestWorkspaceFolders = (client: IpcClient): Effect.Effect<WorkspaceFolders, IpcClientError> =>
  client
    .request({ _tag: 'WorkspaceFolders' })
    .pipe(
      Effect.map(result =>
        result.workspaceFile === undefined
          ? { paths: result.paths }
          : { paths: result.paths, workspaceFile: result.workspaceFile },
      ),
    );

/**
 * Multicast subscribe for unsolicited Workspace folder pushes.
 * Returns dispose; does not replace other listeners.
 */
export const onWorkspaceFoldersChanged = (
  client: IpcClient,
  listener: (folders: WorkspaceFolders) => void,
): (() => void) => client.onWorkspaceFoldersChanged(listener);

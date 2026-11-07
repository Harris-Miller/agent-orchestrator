import { Effect } from 'effect';

import type { IpcClient, IpcClientError } from './ipcClient.ts';

/** Request absolute Workspace folder paths (file-scheme only; empty when none). */
export const requestWorkspaceFolders = (client: IpcClient): Effect.Effect<readonly string[], IpcClientError> =>
  client.request({ _tag: 'WorkspaceFolders' }).pipe(Effect.map(result => result.paths));

/**
 * Multicast subscribe for unsolicited Workspace folder path pushes.
 * Returns dispose; does not replace other listeners.
 */
export const onWorkspaceFoldersChanged = (
  client: IpcClient,
  listener: (paths: readonly string[]) => void,
): (() => void) => client.onWorkspaceFoldersChanged(listener);

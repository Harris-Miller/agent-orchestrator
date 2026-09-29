import { Effect } from 'effect';

import type { IpcClient } from './ipcClient.ts';
import { IpcClientError } from './ipcClient.ts';

/** Request absolute Workspace folder paths (file-scheme only; empty when none). */
export const requestWorkspaceFolders = (client: IpcClient): Effect.Effect<readonly string[], IpcClientError> =>
  client
    .request(id => ({ _tag: 'WorkspaceFolders' as const, id }))
    .pipe(
      Effect.flatMap(message => {
        if (message._tag !== 'WorkspaceFoldersResult') {
          return Effect.fail(new IpcClientError({ message: `Unexpected WorkspaceFolders response: ${message._tag}` }));
        }
        return Effect.succeed(message.paths);
      }),
    );

/**
 * Multicast subscribe for unsolicited Workspace folder path pushes.
 * Returns dispose; does not replace other listeners.
 */
export const onWorkspaceFoldersChanged = (
  client: IpcClient,
  listener: (paths: readonly string[]) => void,
): (() => void) => client.onWorkspaceFoldersChanged(listener);

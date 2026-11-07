import { cloneFileDialogFilters, FileDialog, FileDialogFailed } from '@lib/context-services';
import type { PickFilesOptions } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

/** VS Code webview Live for {@link FileDialog}: Host IPC → extension `showOpenDialog`. */
export const makeFileDialogLive = (client: IpcClient): Layer.Layer<FileDialog> =>
  Layer.succeed(FileDialog, {
    pickFiles: Effect.fn('FileDialog.pickFiles')(function* (options?: PickFilesOptions) {
      const response = yield* client
        .request({
          _tag: 'FileDialogPickFiles',
          filters: options?.filters === undefined ? undefined : cloneFileDialogFilters(options.filters),
          multiple: options?.multiple === true ? true : undefined,
        })
        .pipe(
          Effect.mapError(
            cause =>
              new FileDialogFailed({
                cause,
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          ),
        );
      return response.paths;
    }),
  });

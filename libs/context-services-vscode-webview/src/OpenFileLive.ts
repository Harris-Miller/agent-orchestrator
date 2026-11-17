import type { Base64Image } from '@lib/context-services';
import { OpenFile, OpenFileFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

/** VS Code webview Live for {@link OpenFile}: Host IPC → extension `vscode.open` / `revealInExplorer`. */
export const makeOpenFileLive = (client: IpcClient): Layer.Layer<OpenFile> => {
  const request = Effect.fn('OpenFile.request')(function* (
    message:
      | { readonly _tag: 'OpenFile'; readonly path: string; readonly line?: number }
      | ({ readonly _tag: 'OpenImageData' } & Base64Image),
  ) {
    yield* client
      .request(message)
      .pipe(
        Effect.mapError(
          cause => new OpenFileFailed({ cause, message: cause instanceof Error ? cause.message : String(cause) }),
        ),
      );
  });
  return Layer.succeed(OpenFile, {
    open: (path: string, line?: number) =>
      request(line === undefined ? { _tag: 'OpenFile', path } : { _tag: 'OpenFile', line, path }),
    openImageData: (image: Base64Image) => request({ _tag: 'OpenImageData', ...image }),
    supported: true,
  });
};

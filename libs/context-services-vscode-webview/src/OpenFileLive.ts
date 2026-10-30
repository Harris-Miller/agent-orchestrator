import { OpenFile, OpenFileFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

export const makeOpenFileLive = (client: IpcClient): Layer.Layer<OpenFile> =>
  Layer.succeed(OpenFile, {
    openImageData: Effect.fn('OpenFile.openImageData')(function* (mimeType: string, base64: string) {
      const response = yield* client
        .request(id => ({ _tag: 'OpenImageData' as const, base64, id, mimeType }))
        .pipe(
          Effect.mapError(
            cause => new OpenFileFailed({ cause, message: cause instanceof Error ? cause.message : String(cause) }),
          ),
        );
      if (response._tag !== 'OpenImageDataResult') {
        return yield* new OpenFileFailed({ message: `Unexpected OpenImageData response: ${response._tag}` });
      }
    }),
    supported: true,
    open: Effect.fn('OpenFile.open')(function* (path: string) {
      const response = yield* client
        .request(id => ({ _tag: 'OpenFile' as const, id, path }))
        .pipe(
          Effect.mapError(
            cause => new OpenFileFailed({ cause, message: cause instanceof Error ? cause.message : String(cause) }),
          ),
        );
      if (response._tag !== 'OpenFileResult') {
        return yield* new OpenFileFailed({ message: `Unexpected OpenFile response: ${response._tag}` });
      }
    }),
  });

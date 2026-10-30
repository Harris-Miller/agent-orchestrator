import { OpenUrl, OpenUrlFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

/** VS Code webview Live for {@link OpenUrl}: Host IPC → extension `env.openExternal`. */
export const makeOpenUrlLive = (client: IpcClient): Layer.Layer<OpenUrl> =>
  Layer.succeed(OpenUrl, {
    open: Effect.fn('OpenUrl.open')(function* (url: string) {
      const response = yield* client
        .request(id => ({
          _tag: 'OpenUrl' as const,
          id,
          url,
        }))
        .pipe(
          Effect.mapError(
            cause =>
              new OpenUrlFailed({
                cause,
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          ),
        );
      if (response._tag !== 'OpenUrlResult') {
        return yield* new OpenUrlFailed({
          message: `Unexpected OpenUrl response: ${response._tag}`,
        });
      }
    }),
  });

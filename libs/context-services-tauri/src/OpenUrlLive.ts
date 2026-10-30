import { OpenUrl, OpenUrlFailed } from '@lib/context-services';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Effect, Layer } from 'effect';

/** Tauri Live for {@link OpenUrl}: wraps `@tauri-apps/plugin-opener` `openUrl`. */
export const OpenUrlLive = Layer.succeed(OpenUrl, {
  open: Effect.fn('OpenUrl.open')(function* (url: string) {
    return yield* Effect.tryPromise({
      catch: cause =>
        new OpenUrlFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => openUrl(url),
    });
  }),
});

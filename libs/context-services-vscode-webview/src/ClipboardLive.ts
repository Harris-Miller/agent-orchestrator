import { Clipboard, ClipboardReadFailed, ClipboardWriteFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

/** Browser / VS Code webview Live for {@link Clipboard}: wraps `navigator.clipboard`. */
export const ClipboardLive = Layer.succeed(Clipboard, {
  readText: Effect.fn('Clipboard.readText')(function* () {
    return yield* Effect.tryPromise({
      catch: cause =>
        new ClipboardReadFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => navigator.clipboard.readText(),
    });
  }),
  writeText: Effect.fn('Clipboard.writeText')(function* (text: string) {
    return yield* Effect.tryPromise({
      catch: cause =>
        new ClipboardWriteFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => navigator.clipboard.writeText(text),
    });
  }),
});

import { Clipboard, ClipboardReadFailed, ClipboardWriteFailed } from '@lib/context-services';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Effect, Layer } from 'effect';

/** Tauri Live for {@link Clipboard}: wraps `@tauri-apps/plugin-clipboard-manager` text APIs. */
export const ClipboardLive = Layer.succeed(Clipboard, {
  readText: Effect.fn('Clipboard.readText')(function* () {
    return yield* Effect.tryPromise({
      catch: cause =>
        new ClipboardReadFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => readText(),
    });
  }),
  writeText: Effect.fn('Clipboard.writeText')(function* (text: string) {
    return yield* Effect.tryPromise({
      catch: cause =>
        new ClipboardWriteFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: () => writeText(text),
    });
  }),
});

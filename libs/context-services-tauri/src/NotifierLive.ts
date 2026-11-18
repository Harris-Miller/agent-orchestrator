import { Notifier, NotifyFailed, playChime } from '@lib/context-services';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Effect, Layer } from 'effect';

/** Name of the macOS/Windows default notification sound; omitted for a silent Notification. */
const SYSTEM_SOUND = 'default';

/** Tauri Live for {@link Notifier}: `@tauri-apps/plugin-notification` + the main window's focus state. */
export const NotifierLive = Layer.succeed(Notifier, {
  isWindowFocused: Effect.tryPromise(() => getCurrentWindow().isFocused()).pipe(Effect.orElseSucceed(() => false)),
  notify: Effect.fn('Notifier.notify')(function* (input: { body: string; sound: boolean; title: string }) {
    return yield* Effect.tryPromise({
      catch: cause =>
        new NotifyFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: async () => {
        const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
        if (granted) {
          sendNotification({
            body: input.body,
            title: input.title,
            ...(input.sound ? { sound: SYSTEM_SOUND } : {}),
          });
        }
      },
    });
  }),
  playSound: playChime,
  supported: 'os',
});

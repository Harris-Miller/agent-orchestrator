import { Notifier, NotifyFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

const notifyFailed = (cause: unknown): NotifyFailed =>
  new NotifyFailed({ cause, message: cause instanceof Error ? cause.message : String(cause) });

/**
 * VS Code webview Live for {@link Notifier}.
 *
 * Raises a webview `Notification` (an OS toast; verified on macOS when VS Code is allowed in System
 * Settings → Notifications). The sound is the system sound unless `silent`. Window focus comes from the
 * extension host (`vscode.window.state.focused`), not `document.hasFocus()`.
 */
export const makeNotifierLive = (client: IpcClient): Layer.Layer<Notifier> =>
  Layer.succeed(Notifier, {
    isWindowFocused: client
      .request(id => ({ _tag: 'WindowFocus' as const, id }))
      .pipe(
        Effect.map(response => response._tag === 'WindowFocusResult' && response.focused),
        Effect.orElseSucceed(() => false),
      ),
    notify: Effect.fn('Notifier.notify')(function* (input: { body: string; sound: boolean; title: string }) {
      yield* Effect.tryPromise({
        catch: notifyFailed,
        try: async () => {
          const permission =
            Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
          if (permission !== 'granted') {
            throw new Error(`Notification permission ${permission}`);
          }
          // oxlint-disable-next-line no-new -- constructing the Notification is the side effect
          new Notification(input.title, { body: input.body, silent: !input.sound });
        },
      });
    }),
    supported: 'os',
  });

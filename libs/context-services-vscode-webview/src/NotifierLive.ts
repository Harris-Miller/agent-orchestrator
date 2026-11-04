import { Notifier, NotifyFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

/**
 * VS Code webview Live for {@link Notifier}.
 *
 * Uses the extension host's `showInformationMessage` (`supported: 'in-app'`, no OS toast or sound):
 * a sandboxed webview `Notification` is not confirmed to yield an OS toast (spike pending, #24).
 * Window focus comes from the extension host (`vscode.window.state.focused`), not `document.hasFocus()`.
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
      const response = yield* client
        .request(id => ({ _tag: 'NotifyInApp' as const, body: input.body, id, title: input.title }))
        .pipe(
          Effect.mapError(
            cause =>
              new NotifyFailed({
                cause,
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          ),
        );
      if (response._tag !== 'NotifyInAppResult') {
        return yield* new NotifyFailed({ message: `Unexpected NotifyInApp response: ${response._tag}` });
      }
    }),
    supported: 'in-app',
  });

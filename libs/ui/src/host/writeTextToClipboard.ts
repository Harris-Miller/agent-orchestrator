/** Host clipboard write helper for Promise-edge React (`hostRunPromise`). */
import { Clipboard } from '@lib/context-services';
import { Effect } from 'effect';

export const writeTextToClipboard = Effect.fn('writeTextToClipboard')(function* (text: string) {
  const clipboard = yield* Clipboard;
  yield* clipboard.writeText(text);
});

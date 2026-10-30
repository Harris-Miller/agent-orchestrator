/** Host open-URL helper for Promise-edge React (`hostRunPromise`). */
import { OpenUrl } from '@lib/context-services';
import { Effect } from 'effect';

export const openUrlInHost = Effect.fn('openUrlInHost')(function* (url: string) {
  const openUrl = yield* OpenUrl;
  yield* openUrl.open(url);
});

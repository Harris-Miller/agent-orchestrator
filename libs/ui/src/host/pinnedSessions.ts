import type { PinnedSession } from '@lib/hoa-home';

/**
 * Pins to drop after a COMPLETE `session/list` of `cwd`: pins of that cwd (existing before the request was sent)
 * missing from the raw listed ids. Pins of any other cwd are never swept by this list.
 */
export const pinsToUnpinAfterList = (
  pinsBeforeRequest: readonly PinnedSession[],
  listedIds: ReadonlySet<string>,
  cwd: string,
): readonly string[] =>
  pinsBeforeRequest.filter(pin => pin.cwd === cwd && !listedIds.has(pin.sessionId)).map(pin => pin.sessionId);

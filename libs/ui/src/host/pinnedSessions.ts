import type { PinnedSession } from '@lib/hoa-home';

import { isRecord } from '../isRecord.ts';

import type { SessionListScope } from './sessionListScope.ts';

/**
 * Pins to drop after a successful `session/list`: those (existing before the request was sent) missing from the raw
 * listed ids, within the list scope. A response still carrying `nextCursor` is partial, so nothing is swept (defensive: `listAllSessions` merges every page).
 */
export const pinsToUnpinAfterList = (
  pinsBeforeRequest: readonly PinnedSession[],
  listResult: unknown,
  scope: SessionListScope,
): readonly string[] => {
  if (scope._tag === 'Skip' || !isRecord(listResult) || !Array.isArray(listResult.sessions)) {
    return [];
  }
  if (listResult.nextCursor !== undefined && listResult.nextCursor !== null) {
    return [];
  }
  const listed = new Set(
    listResult.sessions.flatMap((row: unknown) =>
      isRecord(row) && typeof row.sessionId === 'string' ? [row.sessionId] : [],
    ),
  );
  return pinsBeforeRequest
    .filter(pin => (scope._tag === 'Unscoped' || pin.cwd === scope.cwd) && !listed.has(pin.sessionId))
    .map(pin => pin.sessionId);
};

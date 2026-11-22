/** Anything identifying a session: a History row, or a Workstream's persisted `{ launchTarget, sessionId }`. */
type SessionEntryRef = { readonly launchTarget: string; readonly sessionId: string };

/** A Session History row's identity across launch targets (a bare `sessionId` can repeat between providers). */
export const sessionEntryKey = (entry: SessionEntryRef): string => `${entry.launchTarget}:${entry.sessionId}`;

/** `entries` minus the pinned ones: pinned rows render once, in the Pinned section. */
export const withoutPinned = <T extends SessionEntryRef>(
  entries: readonly T[],
  pinned: readonly SessionEntryRef[],
): readonly T[] => {
  const pinnedKeys = new Set(pinned.map(sessionEntryKey));
  return entries.filter(entry => !pinnedKeys.has(sessionEntryKey(entry)));
};

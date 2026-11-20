/** Agents allow at most this many `_session/list/subscribe` subscriptions per connection. */
export const MAX_SESSION_LIST_SUBSCRIPTIONS = 128;

export type SessionListSubscriptionPlan = {
  readonly subscribe: readonly string[];
  readonly unsubscribe: readonly string[];
};

/**
 * Diff the cwds to keep subscribed (deduplicated, first 128 in given order; the rest fall back to re-list) against the
 * currently subscribed ones. Unsubscribing first keeps the connection at or under the cap.
 */
export const planSessionListSubscriptions = (
  desired: readonly string[],
  current: Iterable<string>,
): SessionListSubscriptionPlan => {
  const wanted = [...new Set(desired)].slice(0, MAX_SESSION_LIST_SUBSCRIPTIONS);
  const wantedSet = new Set(wanted);
  const currentSet = new Set(current);
  return {
    subscribe: wanted.filter(cwd => !currentSet.has(cwd)),
    unsubscribe: [...currentSet].filter(cwd => !wantedSet.has(cwd)),
  };
};

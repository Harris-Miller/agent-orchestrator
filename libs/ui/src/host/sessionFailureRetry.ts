import { Option } from 'effect';

import type { ChatItem } from './sessionUpdateReducer.ts';

type UserMessageItem = Extract<ChatItem, { kind: 'user_message' }>;

/**
 * The user message a Session failure row's Retry re-sends, if Retry is offered: the Session has no turn or
 * Client→Agent request in flight, and the row is the latest Session failure and sits after the last user message
 * (so an old row replayed by `session/load`, or one a newer turn has superseded, offers none). Images are slim refs
 * in the transcript and would be dropped on a re-send, so a message with images is not retryable.
 */
export const retryableUserMessage = (
  session: { readonly pendingClientRequest?: unknown; readonly status: string },
  items: readonly ChatItem[],
  failureId: string,
): Option.Option<UserMessageItem> => {
  if (session.status !== 'active' || session.pendingClientRequest !== undefined) {
    return Option.none();
  }
  const lastFailure = items.findLast(entry => entry.kind === 'session_failure');
  const lastUserIndex = items.findLastIndex(entry => entry.kind === 'user_message');
  const lastUser = items[lastUserIndex];
  if (
    lastFailure?.id !== failureId ||
    lastUser?.kind !== 'user_message' ||
    items.findIndex(entry => entry.id === failureId) < lastUserIndex ||
    (lastUser.images ?? []).length > 0
  ) {
    return Option.none();
  }
  return Option.some(lastUser);
};

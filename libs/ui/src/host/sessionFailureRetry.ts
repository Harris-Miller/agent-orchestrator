import { Option } from 'effect';

import type { ChatItem } from './sessionUpdateReducer.ts';

type UserMessageItem = Extract<ChatItem, { kind: 'user_message' }>;
type SessionLike = { readonly pendingClientRequest?: unknown; readonly status: string };

/** The fixed text a usage-limit failure's Continue sends as an ordinary user message. */
export const CONTINUE_PROMPT_TEXT = 'Continue where you left off.';

/**
 * Whether a Session failure row may offer an action at all: the Session has no turn or Client→Agent request in
 * flight, and the row is the latest Session failure and sits after the last user message (so an old row replayed by
 * `session/load`, or one a newer turn has superseded, offers none). Yields the last user message, if any.
 */
const actionableLastUser = (
  session: SessionLike,
  items: readonly ChatItem[],
  failureId: string,
): Option.Option<UserMessageItem | undefined> => {
  if (session.status !== 'active' || session.pendingClientRequest !== undefined) {
    return Option.none();
  }
  const lastFailure = items.findLast(entry => entry.kind === 'session_failure');
  const lastUserIndex = items.findLastIndex(entry => entry.kind === 'user_message');
  if (lastFailure?.id !== failureId || items.findIndex(entry => entry.id === failureId) < lastUserIndex) {
    return Option.none();
  }
  const lastUser = items[lastUserIndex];
  return Option.some(lastUser?.kind === 'user_message' ? lastUser : undefined);
};

/**
 * The user message a Session failure row's Retry re-sends, if Retry is offered. Images are slim refs in the
 * transcript and would be dropped on a re-send, so a message with images is not retryable.
 */
export const retryableUserMessage = (
  session: SessionLike,
  items: readonly ChatItem[],
  failureId: string,
): Option.Option<UserMessageItem> =>
  actionableLastUser(session, items, failureId).pipe(
    Option.flatMap(lastUser =>
      lastUser === undefined || (lastUser.images ?? []).length > 0 ? Option.none() : Option.some(lastUser),
    ),
  );

/** Whether a usage-limit (`limit`) Session failure row offers Continue; needs no re-sendable last user message. */
export const canContinueFailure = (session: SessionLike, items: readonly ChatItem[], failureId: string): boolean => {
  const row = items.find(entry => entry.id === failureId);
  return (
    row?.kind === 'session_failure' &&
    row.category === 'limit' &&
    row.actions.includes('retry') &&
    Option.isSome(actionableLastUser(session, items, failureId))
  );
};

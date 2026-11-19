import type { AcpAgentConnection, ListSessionsResponse } from '@libs/effect-acp';
import { Effect, Schema } from 'effect';

/** Safety cap on `session/list` pages followed in one call. */
const MAX_LIST_PAGES = 100;

/** The agent kept returning a `nextCursor` already followed. */
export class RepeatedSessionListCursor extends Schema.TaggedError<RepeatedSessionListCursor>()(
  'RepeatedSessionListCursor',
  { cursor: Schema.String },
) {}

/** The agent kept paging past `MAX_LIST_PAGES`. */
export class TooManySessionListPages extends Schema.TaggedError<TooManySessionListPages>()('TooManySessionListPages', {
  pages: Schema.Number,
}) {}

type ListAgent = Pick<AcpAgentConnection['agent'], 'session/list'>;
type ListPayload = Parameters<ListAgent['session/list']>[0];

/**
 * `session/list` across every page: follows `nextCursor` until exhausted, handing each page to `onPage` as it
 * arrives (so earlier pages survive a later failure). A page failure, a repeated cursor or the page cap fails this
 * one list only.
 */
export const listSessionPages = Effect.fnUntraced(function* (
  agent: ListAgent,
  payload: Omit<ListPayload, 'cursor'>,
  onPage: (page: ListSessionsResponse) => void,
) {
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; ; page += 1) {
    if (page >= MAX_LIST_PAGES) {
      return yield* new TooManySessionListPages({ pages: page });
    }
    const response = yield* agent['session/list'](cursor === undefined ? payload : { ...payload, cursor });
    onPage(response);
    const { nextCursor } = response;
    if (nextCursor === undefined || nextCursor === null) {
      return;
    }
    if (seen.has(nextCursor)) {
      return yield* new RepeatedSessionListCursor({ cursor: nextCursor });
    }
    seen.add(nextCursor);
    cursor = nextCursor;
  }
});

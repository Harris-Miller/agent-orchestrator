import type { AcpAgentConnection, ListSessionsResponse } from '@libs/effect-acp';
import { Effect, Schema } from 'effect';

/** Safety cap on `session/list` pages followed in one call. */
export const MAX_LIST_PAGES = 100;

export class SessionListPagingError extends Schema.TaggedError<SessionListPagingError>()('SessionListPagingError', {
  reason: Schema.Literals(['RepeatedCursor', 'TooManyPages']),
  cursor: Schema.optional(Schema.String),
}) {}

type ListAgent = Pick<AcpAgentConnection['agent'], 'session/list'>;
type ListPayload = Parameters<ListAgent['session/list']>[0];

/**
 * `session/list` across every page: follows `nextCursor` until exhausted and merges `sessions` in order. Any page
 * failure fails the whole effect (nothing partial). The result is the last page with merged sessions and no `nextCursor`.
 */
export const listAllSessions = Effect.fnUntraced(function* (agent: ListAgent, payload: Omit<ListPayload, 'cursor'>) {
  const seen = new Set<string>();
  const sessions: ListSessionsResponse['sessions'][number][] = [];
  let cursor: string | undefined;
  for (let page = 0; ; page += 1) {
    if (page >= MAX_LIST_PAGES) {
      return yield* new SessionListPagingError({ reason: 'TooManyPages', cursor });
    }
    const response = yield* agent['session/list'](cursor === undefined ? payload : { ...payload, cursor });
    sessions.push(...response.sessions);
    const { nextCursor, ...rest } = response;
    if (nextCursor === undefined || nextCursor === null) {
      return { ...rest, sessions };
    }
    if (seen.has(nextCursor)) {
      return yield* new SessionListPagingError({ reason: 'RepeatedCursor', cursor: nextCursor });
    }
    seen.add(nextCursor);
    cursor = nextCursor;
  }
});

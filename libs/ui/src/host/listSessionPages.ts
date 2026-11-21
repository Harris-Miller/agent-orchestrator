import type { AcpAgentConnection, ListSessionsResponse } from '@libs/effect-acp';
import type { Effect } from 'effect';
import { Schema } from 'effect';

/** Safety cap on `session/list` pages followed for one launch target of one Import. */
export const MAX_LIST_PAGES = 100;

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

/** One `session/list` page: the first when `cursor` is omitted, else the page that `cursor` names. */
export const listSessionPage = (
  agent: ListAgent,
  payload: Omit<ListPayload, 'cursor'>,
  cursor: string | undefined,
): Effect.Effect<ListSessionsResponse, unknown> =>
  agent['session/list'](cursor === undefined ? payload : { ...payload, cursor });

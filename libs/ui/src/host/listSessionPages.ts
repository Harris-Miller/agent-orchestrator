import type { AcpAgentConnection, ListSessionsResponse } from '@libs/effect-acp';
import type { Effect } from 'effect';

/** Safety cap on `session/list` pages followed for one launch target of one Import. */
export const MAX_LIST_PAGES = 100;

type ListAgent = Pick<AcpAgentConnection['agent'], 'session/list'>;
type ListPayload = Parameters<ListAgent['session/list']>[0];

/** One `session/list` page: the first when `cursor` is omitted, else the page that `cursor` names. */
export const listSessionPage = (
  agent: ListAgent,
  payload: Omit<ListPayload, 'cursor'>,
  cursor: string | undefined,
): Effect.Effect<ListSessionsResponse, unknown> =>
  agent['session/list'](cursor === undefined ? payload : { ...payload, cursor });

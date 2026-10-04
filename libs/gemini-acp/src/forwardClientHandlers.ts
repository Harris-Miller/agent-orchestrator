import type { AcpClientConnection } from '@libs/effect-acp';
import { ClientRpcs } from '@libs/effect-acp';
import { Effect } from 'effect';

import { patchRosterTitle } from './adapterRosterSessions.ts';

export type ForwardClientParent = Pick<
  AcpClientConnection,
  | 'elicitation/complete'
  | 'elicitation/create'
  | 'fs/read_text_file'
  | 'fs/write_text_file'
  | 'session/request_permission'
  | 'session/update'
  | 'terminal/create'
  | 'terminal/kill'
  | 'terminal/output'
  | 'terminal/release'
  | 'terminal/wait_for_exit'
>;

const orDie =
  <A, E, Args extends readonly unknown[]>(method: (...args: Args) => Effect.Effect<A, E>) =>
  (...args: Args): Effect.Effect<A> =>
    method(...args).pipe(Effect.orDie);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Handler map that re-invokes every Client RPC on the parent (Harness) connection. */
export const makeForwardClientHandlerMap = (parent: ForwardClientParent) =>
  ClientRpcs.of({
    'elicitation/complete': orDie(parent['elicitation/complete']),
    'elicitation/create': orDie(parent['elicitation/create']),
    'fs/read_text_file': orDie(parent['fs/read_text_file']),
    'fs/write_text_file': orDie(parent['fs/write_text_file']),
    'session/request_permission': orDie(parent['session/request_permission']),
    'session/update': payload =>
      Effect.gen(function* () {
        const { update } = payload;
        if (
          isRecord(update) &&
          update.sessionUpdate === 'session_info_update' &&
          'title' in update &&
          (typeof update.title === 'string' || update.title === null)
        ) {
          yield* patchRosterTitle(payload.sessionId, update.title).pipe(Effect.orDie);
        }
        yield* parent['session/update'](payload);
      }).pipe(Effect.orDie),
    'terminal/create': orDie(parent['terminal/create']),
    'terminal/kill': orDie(parent['terminal/kill']),
    'terminal/output': orDie(parent['terminal/output']),
    'terminal/release': orDie(parent['terminal/release']),
    'terminal/wait_for_exit': orDie(parent['terminal/wait_for_exit']),
  });

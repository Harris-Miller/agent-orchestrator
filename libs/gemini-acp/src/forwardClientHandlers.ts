import type { AcpClientConnection } from '@libs/effect-acp';
import { ClientRpcs } from '@libs/effect-acp';
import { Effect } from 'effect';

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

/** Handler map that re-invokes every Client RPC on the parent (Harness) connection. */
export const makeForwardClientHandlerMap = (parent: ForwardClientParent) =>
  ClientRpcs.of({
    'elicitation/complete': orDie(parent['elicitation/complete']),
    'elicitation/create': orDie(parent['elicitation/create']),
    'fs/read_text_file': orDie(parent['fs/read_text_file']),
    'fs/write_text_file': orDie(parent['fs/write_text_file']),
    'session/request_permission': orDie(parent['session/request_permission']),
    'session/update': orDie(parent['session/update']),
    'terminal/create': orDie(parent['terminal/create']),
    'terminal/kill': orDie(parent['terminal/kill']),
    'terminal/output': orDie(parent['terminal/output']),
    'terminal/release': orDie(parent['terminal/release']),
    'terminal/wait_for_exit': orDie(parent['terminal/wait_for_exit']),
  });

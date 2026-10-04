import type { AcpClientConnection } from '@libs/effect-acp';
import { ClientRpcs } from '@libs/effect-acp';
import type { Layer } from 'effect';
import { Effect } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';

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

/** Handler map that re-invokes every Client RPC on the parent (Harness) connection. */
export const makeForwardClientHandlerMap = (parent: ForwardClientParent) =>
  ClientRpcs.of({
    'elicitation/complete': payload => parent['elicitation/complete'](payload).pipe(Effect.orDie),
    'elicitation/create': payload => parent['elicitation/create'](payload).pipe(Effect.orDie),
    'fs/read_text_file': payload => parent['fs/read_text_file'](payload).pipe(Effect.orDie),
    'fs/write_text_file': payload => parent['fs/write_text_file'](payload).pipe(Effect.orDie),
    'session/request_permission': payload => parent['session/request_permission'](payload).pipe(Effect.orDie),
    'session/update': payload => parent['session/update'](payload).pipe(Effect.orDie),
    'terminal/create': payload => parent['terminal/create'](payload).pipe(Effect.orDie),
    'terminal/kill': payload => parent['terminal/kill'](payload).pipe(Effect.orDie),
    'terminal/output': payload => parent['terminal/output'](payload).pipe(Effect.orDie),
    'terminal/release': payload => parent['terminal/release'](payload).pipe(Effect.orDie),
    'terminal/wait_for_exit': payload => parent['terminal/wait_for_exit'](payload).pipe(Effect.orDie),
  });

export const makeForwardClientHandlers = (
  parent: ForwardClientParent,
): Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof ClientRpcs>>> =>
  ClientRpcs.toLayer(Effect.succeed(makeForwardClientHandlerMap(parent)));

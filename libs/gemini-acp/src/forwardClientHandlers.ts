import type { AcpClientConnection } from '@libs/effect-acp';
import { ClientRpcs } from '@libs/effect-acp';
import type { Layer } from 'effect';
import { Effect } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';

/** Handler map that re-invokes every Client RPC on the parent (Harness) connection. */
export const makeForwardClientHandlerMap = (parent: AcpClientConnection) => ({
  'elicitation/complete': (payload: Parameters<AcpClientConnection['elicitation/complete']>[0]) =>
    parent['elicitation/complete'](payload).pipe(Effect.orDie),
  'elicitation/create': (payload: Parameters<AcpClientConnection['elicitation/create']>[0]) =>
    parent['elicitation/create'](payload).pipe(Effect.orDie),
  'fs/read_text_file': (payload: Parameters<AcpClientConnection['fs/read_text_file']>[0]) =>
    parent['fs/read_text_file'](payload).pipe(Effect.orDie),
  'fs/write_text_file': (payload: Parameters<AcpClientConnection['fs/write_text_file']>[0]) =>
    parent['fs/write_text_file'](payload).pipe(Effect.orDie),
  'session/request_permission': (payload: Parameters<AcpClientConnection['session/request_permission']>[0]) =>
    parent['session/request_permission'](payload).pipe(Effect.orDie),
  'session/update': (payload: Parameters<AcpClientConnection['session/update']>[0]) =>
    parent['session/update'](payload).pipe(Effect.orDie),
  'terminal/create': (payload: Parameters<AcpClientConnection['terminal/create']>[0]) =>
    parent['terminal/create'](payload).pipe(Effect.orDie),
  'terminal/kill': (payload: Parameters<AcpClientConnection['terminal/kill']>[0]) =>
    parent['terminal/kill'](payload).pipe(Effect.orDie),
  'terminal/output': (payload: Parameters<AcpClientConnection['terminal/output']>[0]) =>
    parent['terminal/output'](payload).pipe(Effect.orDie),
  'terminal/release': (payload: Parameters<AcpClientConnection['terminal/release']>[0]) =>
    parent['terminal/release'](payload).pipe(Effect.orDie),
  'terminal/wait_for_exit': (payload: Parameters<AcpClientConnection['terminal/wait_for_exit']>[0]) =>
    parent['terminal/wait_for_exit'](payload).pipe(Effect.orDie),
});

export const makeForwardClientHandlers = (
  parent: AcpClientConnection,
): Layer.Layer<Rpc.ToHandler<RpcGroup.Rpcs<typeof ClientRpcs>>> =>
  ClientRpcs.toLayer(makeForwardClientHandlerMap(parent) as never);

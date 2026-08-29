import { Effect, Stdio, Stream } from 'effect';
import { RpcSerialization } from 'effect/unstable/rpc';

const ndJsonRpc = RpcSerialization.ndJsonRpc();
const parser = ndJsonRpc.makeUnsafe();
const textDecoder = new TextDecoder();

/** Send an id-less JSON-RPC notification to the parent client over stdout. */
export const notifyClient = Effect.fn('notifyClient')(function* (tag: string, payload: unknown) {
  const stdio = yield* Stdio.Stdio;
  const encoded = parser.encode({
    _tag: 'Request',
    headers: [],
    id: '',
    isNotification: true,
    payload,
    tag,
  });

  if (encoded === undefined) {
    return;
  }

  const line = typeof encoded === 'string' ? encoded : textDecoder.decode(encoded);
  yield* Stream.make(line).pipe(Stream.run(stdio.stdout({ endOnDone: false })));
});

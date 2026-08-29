import { Effect, Queue, Schema, Stream } from 'effect';
import type { ChildProcessSpawner } from 'effect/unstable/process';
import { RpcSerialization } from 'effect/unstable/rpc';
import { RpcClientDefect, RpcClientError } from 'effect/unstable/rpc/RpcClientError';

export class TransportError extends Schema.TaggedError<TransportError>()('TransportError', {
  message: Schema.String,
}) {}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const makeStdioTransport = Effect.fn('makeStdioTransport')(function* (
  handle: ChildProcessSpawner.ChildProcessHandle,
  route: (message: unknown) => Effect.Effect<void>,
) {
  const serialization = yield* RpcSerialization.RpcSerialization;
  const parser = serialization.makeUnsafe();
  const queue = yield* Queue.make<Uint8Array>();

  const encodeToBytes = (message: unknown): Effect.Effect<Uint8Array | undefined, TransportError> =>
    Effect.try({
      catch: cause => TransportError.make({ message: `Failed to encode message: ${String(cause)}` }),
      try: () => {
        const encoded = parser.encode(message);
        if (encoded === undefined) {
          return undefined;
        }
        return typeof encoded === 'string' ? textEncoder.encode(encoded) : encoded;
      },
    });

  const send = (message: unknown): Effect.Effect<void, TransportError> =>
    Effect.gen(function* () {
      const bytes = yield* encodeToBytes(message);
      if (bytes === undefined) {
        return;
      }
      yield* Queue.offer(queue, bytes).pipe(
        Effect.mapError(cause => TransportError.make({ message: `Failed to write to stdin queue: ${String(cause)}` })),
      );
    });

  const notify = (tag: string, payload: unknown): Effect.Effect<void, TransportError> =>
    send({
      _tag: 'Request',
      headers: [],
      id: '',
      isNotification: true,
      payload,
      tag,
    });

  const start = Effect.gen(function* () {
    const lineBuffer = { value: '' };

    yield* handle.stdout.pipe(
      Stream.runForEach(data =>
        Effect.gen(function* () {
          lineBuffer.value += textDecoder.decode(data, { stream: true });
          let newlineIndex = lineBuffer.value.indexOf('\n');

          while (newlineIndex !== -1) {
            const line = lineBuffer.value.slice(0, newlineIndex).trim();
            lineBuffer.value = lineBuffer.value.slice(newlineIndex + 1);

            if (line.startsWith('{')) {
              const decoded = yield* Effect.try({
                catch: (cause: unknown) =>
                  TransportError.make({ message: `Failed to decode stdout line: ${String(cause)}` }),
                try: () => parser.decode(textEncoder.encode(`${line}\n`)),
              }).pipe(
                Effect.tapError(error => Effect.logError(error.message)),
                Effect.catch(() => Effect.succeed([] as const)),
              );
              yield* Effect.forEach(decoded, route, { discard: true });
            }

            newlineIndex = lineBuffer.value.indexOf('\n');
          }
        }),
      ),
      Effect.tapError(Effect.logError),
      Effect.forkScoped,
    );

    yield* Stream.fromQueue(queue).pipe(Stream.run(handle.stdin), Effect.tapError(Effect.logError), Effect.forkScoped);

    yield* Effect.forkScoped(
      handle.exitCode.pipe(
        Effect.flatMap(exitCode =>
          route({
            _tag: 'ClientProtocolError',
            error: new RpcClientError({
              reason: new RpcClientDefect({
                cause: exitCode,
                message: `Child process exited with code ${String(exitCode)}`,
              }),
            }),
          }),
        ),
        Effect.catch(() => Effect.void),
      ),
    );
  });

  return {
    codecFor: serialization.codecFor,
    notify,
    send,
    start,
  } as const;
});

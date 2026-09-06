import type { Sink } from 'effect';
import { Effect, Queue, Schema, Stdio, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ChildProcessSpawner } from 'effect/unstable/process';
import { RpcSerialization } from 'effect/unstable/rpc';
import { RpcClientDefect, RpcClientError } from 'effect/unstable/rpc/RpcClientError';

export class TransportError extends Schema.TaggedError<TransportError>()('TransportError', {
  message: Schema.String,
}) {}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type WireTap = {
  readonly onMessage: (direction: 'in' | 'out', message: unknown) => void;
};

type DuplexStreams = {
  readonly onReadClosed?: Effect.Effect<void>;
  readonly read: Stream.Stream<Uint8Array, unknown>;
  readonly writeSink: Sink.Sink<void, Uint8Array, never, PlatformError>;
};

const makeDuplexTransport = Effect.fn('makeDuplexTransport')(function* (
  streams: DuplexStreams,
  route: (message: unknown) => Effect.Effect<void>,
  wireTap?: WireTap,
) {
  const serialization = yield* RpcSerialization.RpcSerialization;
  const parser = serialization.makeUnsafe();
  const queue = yield* Queue.make<Uint8Array>();

  yield* Effect.addFinalizer(() => Queue.shutdown(queue).pipe(Effect.ignore));

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
      wireTap?.onMessage('out', message);
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

    yield* streams.read.pipe(
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

    yield* Stream.fromQueue(queue).pipe(
      Stream.run(streams.writeSink),
      Effect.tapError(Effect.logError),
      Effect.forkScoped,
    );

    if (streams.onReadClosed !== undefined) {
      yield* Effect.forkScoped(streams.onReadClosed);
    }
  });

  return {
    codecFor: serialization.codecFor,
    notify,
    send,
    start,
  } as const;
});

export const makeStdioTransport = Effect.fn('makeStdioTransport')(function* (
  handle: ChildProcessSpawner.ChildProcessHandle,
  route: (message: unknown) => Effect.Effect<void>,
  wireTap?: WireTap,
) {
  return yield* makeDuplexTransport(
    {
      onReadClosed: handle.exitCode.pipe(
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
      read: handle.stdout,
      writeSink: handle.stdin,
    },
    route,
    wireTap,
  );
});

/** Parent-process stdio duplex for Agent processes (read stdin, write stdout). */
export const makeParentStdioTransport = Effect.fn('makeParentStdioTransport')(function* (
  route: (message: unknown) => Effect.Effect<void>,
  wireTap?: WireTap,
) {
  const stdio = yield* Stdio.Stdio;

  return yield* makeDuplexTransport(
    {
      read: stdio.stdin,
      // stdout accepts string | Uint8Array; we only enqueue Uint8Array frames
      writeSink: stdio.stdout({ endOnDone: false }),
    },
    route,
    wireTap,
  );
});

import type { Sink } from 'effect';
import { Effect, Queue, Schema, Stdio, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ChildProcessSpawner } from 'effect/process';
import { RpcSerialization } from 'effect/rpc';
import { RpcClientDefect, RpcClientError } from 'effect/rpc/RpcClientError';

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

const makeDuplexTransport = Effect.fn('makeDuplexTransport')(
  function* (streams: DuplexStreams, route: (message: unknown) => Effect.Effect<void>, wireTap?: WireTap) {
    const serialization = yield* RpcSerialization.RpcSerialization;
    const parser = serialization.makeUnsafe();
    const queue = yield* Queue.make<Uint8Array>();

    yield* Effect.addFinalizer(() =>
      Effect.logDebug('ACP duplex transport shutting down').pipe(Effect.andThen(Queue.shutdown(queue)), Effect.ignore),
    );

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
      }).pipe(Effect.tapError(error => Effect.logError('ACP encode failed', error.message)));

    const send = (message: unknown): Effect.Effect<void, TransportError> =>
      Effect.gen(function* () {
        wireTap?.onMessage('out', message);
        const bytes = yield* encodeToBytes(message);
        if (bytes === undefined) {
          yield* Effect.logDebug('ACP encode produced no bytes (batched)');
          return;
        }
        yield* Queue.offer(queue, bytes).pipe(
          Effect.mapError(cause =>
            TransportError.make({ message: `Failed to write to stdin queue: ${String(cause)}` }),
          ),
          Effect.tapError(error => Effect.logError('ACP write queue failed', error.message)),
        );
      });

    const notify = (tag: string, payload: unknown): Effect.Effect<void, TransportError> =>
      Effect.gen(function* () {
        yield* Effect.logDebug('ACP notify', tag);
        return yield* send({
          _tag: 'Request',
          headers: [],
          id: '',
          isNotification: true,
          payload,
          tag,
        });
      });

    const start = Effect.gen(function* () {
      yield* Effect.logInfo('ACP duplex transport starting');
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
                  // The parse error can quote the line, which is Agent content (Private data).
                  catch: () => TransportError.make({ message: 'Failed to decode stdout line' }),
                  try: () => parser.decode(textEncoder.encode(`${line}\n`)),
                }).pipe(
                  Effect.tapError(error => Effect.logWarning('ACP decode failed; dropping line', error.message)),
                  Effect.catch(() => Effect.succeed([] as const)),
                );
                yield* Effect.forEach(decoded, route, { discard: true });
              } else if (line.length > 0) {
                yield* Effect.logDebug('ACP ignoring non-JSON stdout line');
              }

              newlineIndex = lineBuffer.value.indexOf('\n');
            }
          }),
        ),
        Effect.tapError(error => Effect.logError('ACP read stream failed', error)),
        Effect.forkScoped,
      );

      yield* Stream.fromQueue(queue).pipe(
        Stream.run(streams.writeSink),
        Effect.tapError(error => Effect.logError('ACP write stream failed', error)),
        Effect.forkScoped,
      );

      if (streams.onReadClosed !== undefined) {
        yield* Effect.forkScoped(
          streams.onReadClosed.pipe(
            Effect.tap(() => Effect.logInfo('ACP read side closed')),
            Effect.tapError(error => Effect.logError('ACP onReadClosed failed', error)),
          ),
        );
      }
    });

    return {
      codecFor: serialization.codecFor,
      notify,
      send,
      start,
    } as const;
  },
  Effect.annotateLogs({ module: 'AcpTransport' }),
);

export const makeStdioTransport = Effect.fn('makeStdioTransport')(
  function* (
    handle: ChildProcessSpawner.ChildProcessHandle,
    route: (message: unknown) => Effect.Effect<void>,
    wireTap?: WireTap,
  ) {
    yield* Effect.logInfo('ACP child stdio transport', { pid: handle.pid });
    return yield* makeDuplexTransport(
      {
        onReadClosed: handle.exitCode.pipe(
          Effect.tap(exitCode => Effect.logWarning('ACP child process exited', { exitCode })),
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
          Effect.catch(error => Effect.logError('ACP child exit handling failed', error).pipe(Effect.asVoid)),
        ),
        read: handle.stdout,
        writeSink: handle.stdin,
      },
      route,
      wireTap,
    );
  },
  Effect.annotateLogs({ module: 'AcpTransport', transport: 'child-stdio' }),
);

/** Parent-process stdio duplex for Agent processes (read stdin, write stdout). */
export const makeParentStdioTransport = Effect.fn('makeParentStdioTransport')(
  function* (route: (message: unknown) => Effect.Effect<void>, wireTap?: WireTap) {
    yield* Effect.logInfo('ACP parent stdio transport');
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
  },
  Effect.annotateLogs({ module: 'AcpTransport', transport: 'parent-stdio' }),
);

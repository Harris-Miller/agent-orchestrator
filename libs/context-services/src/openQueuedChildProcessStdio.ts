/**
 * Shared queue + ChildProcessHandle assembly for Host ChildProcessSpawner Lives.
 * Spawn transport stays in each adapter; this module owns stdio queues, exit
 * deferred, and makeHandle wiring (Effect-only — safe for webview).
 *
 * Open stdio first (so adapters can attach transport listeners before spawn),
 * then `finalize` with pid / kill / stdin after the child exists.
 */
import type { Cause, Scope } from 'effect';
import { Context, Deferred, Effect, Queue, Sink, Stream, Tracer } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

export const mapSpawnError = (method: string, cause: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    cause,
    description: cause instanceof Error ? cause.message : String(cause),
    method,
    module: 'ChildProcess',
  });

export type QueuedChildProcessCallbacks = {
  readonly onExit: (code: number) => void;
  readonly onSpawnError: (cause: unknown) => void;
  readonly onStderrChunk: (chunk: Uint8Array) => void;
  readonly onStderrEnd: () => void;
  readonly onStderrFail: (cause: unknown) => void;
  readonly onStdoutChunk: (chunk: Uint8Array) => void;
  readonly onStdoutEnd: () => void;
  readonly onStdoutFail: (cause: unknown) => void;
};

export type FinalizeQueuedChildProcessHandleOptions = {
  readonly kill: Effect.Effect<void, PlatformError.PlatformError>;
  readonly pid: number;
  readonly writeStdin: (chunk: Uint8Array) => Effect.Effect<void, PlatformError.PlatformError>;
};

export type QueuedChildProcessStdio = QueuedChildProcessCallbacks & {
  readonly finalize: (
    options: FinalizeQueuedChildProcessHandleOptions,
  ) => Effect.Effect<ChildProcessSpawner.ChildProcessHandle, never, Scope.Scope>;
};

export type OpenQueuedChildProcessStdioOptions = {
  readonly stderrMode?: 'inherit' | 'pipe';
};

export const openQueuedChildProcessStdio = Effect.fnUntraced(function* (
  options: OpenQueuedChildProcessStdioOptions = {},
) {
  const stderrMode = options.stderrMode ?? 'pipe';
  const stdoutQueue = yield* Queue.unbounded<Uint8Array, Cause.Done | PlatformError.PlatformError>();
  const stderrQueue = yield* Queue.unbounded<Uint8Array, Cause.Done | PlatformError.PlatformError>();
  const exitDeferred = yield* Deferred.make<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>();
  const runningRef = { current: true };

  // Callbacks leave the Effect fiber; reuse surrounding services via runForkWith.
  // Omit ParentSpan so transport callbacks do not inherit spawn as forever parents.
  const runFork = Effect.runForkWith(Context.omit(Tracer.ParentSpan)(yield* Effect.context()));

  const endQueues = Effect.gen(function* () {
    yield* Queue.end(stdoutQueue).pipe(Effect.ignore);
    yield* Queue.end(stderrQueue).pipe(Effect.ignore);
  });

  const onStdoutFail = (cause: unknown) => {
    runFork(
      Effect.logWarning('Child stdout chunk failed', cause).pipe(
        Effect.andThen(Queue.fail(stdoutQueue, mapSpawnError('stdout', cause))),
      ),
    );
  };

  const onStderrFail = (cause: unknown) => {
    runFork(
      Effect.logWarning('Child stderr chunk failed', cause).pipe(
        Effect.andThen(Queue.fail(stderrQueue, mapSpawnError('stderr', cause))),
      ),
    );
  };

  const callbacks: QueuedChildProcessCallbacks = {
    onExit: code => {
      runningRef.current = false;
      runFork(
        Effect.gen(function* () {
          yield* Deferred.succeed(exitDeferred, ChildProcessSpawner.ExitCode(code));
          yield* endQueues;
        }),
      );
    },
    onSpawnError: cause => {
      runningRef.current = false;
      runFork(
        Effect.gen(function* () {
          yield* Deferred.fail(exitDeferred, mapSpawnError('spawn', cause));
          yield* endQueues;
        }),
      );
    },
    onStderrChunk: chunk => {
      try {
        Queue.offerUnsafe(stderrQueue, chunk);
      } catch (cause) {
        onStderrFail(cause);
      }
    },
    onStderrEnd: () => {
      runFork(Queue.end(stderrQueue).pipe(Effect.ignore));
    },
    onStderrFail,
    onStdoutChunk: chunk => {
      try {
        Queue.offerUnsafe(stdoutQueue, chunk);
      } catch (cause) {
        onStdoutFail(cause);
      }
    },
    onStdoutEnd: () => {
      runFork(Queue.end(stdoutQueue).pipe(Effect.ignore));
    },
    onStdoutFail,
  };

  const finalize = (finalizeOptions: FinalizeQueuedChildProcessHandleOptions) =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          const shouldKill = runningRef.current;
          runningRef.current = false;
          if (shouldKill) {
            yield* finalizeOptions.kill.pipe(Effect.ignore);
          }
          yield* Queue.shutdown(stdoutQueue);
          yield* Queue.shutdown(stderrQueue);
        }),
      );

      const stdout = Stream.fromQueue(stdoutQueue);
      const stderr =
        stderrMode === 'inherit'
          ? Stream.fromEffect(Deferred.await(exitDeferred)).pipe(Stream.drain)
          : Stream.fromQueue(stderrQueue);

      return ChildProcessSpawner.makeHandle({
        all: Stream.merge(stdout, stderr),
        exitCode: Deferred.await(exitDeferred),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        isRunning: Effect.sync(() => runningRef.current),
        kill: () =>
          Effect.gen(function* () {
            yield* finalizeOptions.kill;
            runningRef.current = false;
          }),
        pid: ChildProcessSpawner.ProcessId(finalizeOptions.pid),
        stderr,
        stdin: Sink.forEach(chunk => finalizeOptions.writeStdin(chunk)),
        stdout,
        unref: Effect.succeed(Effect.void),
      });
    });

  return { ...callbacks, finalize } satisfies QueuedChildProcessStdio;
});

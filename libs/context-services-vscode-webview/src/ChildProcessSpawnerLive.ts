/**
 * Webview ChildProcessSpawner over extension↔webview IPC.
 */
import type { Cause } from 'effect';
import { Context, Deferred, Effect, Layer, Queue, Sink, Stream, Tracer } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/unstable/process';
import type { Command as EffectCommand } from 'effect/unstable/process/ChildProcess';

import type { IpcClient } from './protocol/ipcClient.ts';
import { bytesToArrayBuffer } from './protocol/messages.ts';

const mapSpawnError = (method: string, cause: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    cause,
    description: cause instanceof Error ? cause.message : String(cause),
    method,
    module: 'ChildProcess',
  });

const toStdioMode = (value: unknown): 'ignore' | 'inherit' | 'pipe' | undefined => {
  if (value === 'pipe' || value === 'inherit' || value === 'ignore') {
    return value;
  }
  return undefined;
};

const spawnStandard = Effect.fnUntraced(function* (
  client: IpcClient,
  command: Extract<EffectCommand, { readonly _tag: 'StandardCommand' }>,
) {
  const stdoutQueue = yield* Queue.unbounded<Uint8Array, Cause.Done | PlatformError.PlatformError>();
  const stderrQueue = yield* Queue.unbounded<Uint8Array, Cause.Done | PlatformError.PlatformError>();
  const exitDeferred = yield* Deferred.make<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>();
  const runningRef = { current: true };
  const stderrMode = command.options.stderr ?? 'pipe';

  const response = yield* client
    .request(id => ({
      _tag: 'Spawn' as const,
      args: [...command.args],
      command: command.command,
      id,
      options: {
        cwd: command.options.cwd,
        env: command.options.env as Record<string, string> | undefined,
        extendEnv: command.options.extendEnv,
        stderr: toStdioMode(command.options.stderr),
        stdin: toStdioMode(command.options.stdin),
        stdout: toStdioMode(command.options.stdout),
      },
    }))
    .pipe(Effect.mapError(cause => mapSpawnError('spawn', cause)));

  if (response._tag !== 'SpawnResult') {
    return yield* mapSpawnError('spawn', new Error(response._tag));
  }

  const { handleId, pid } = response;
  const runFork = Effect.runForkWith(Context.omit(Tracer.ParentSpan)(yield* Effect.context()));

  // End queues so Stream.fromQueue readers (e.g. fd listing runCollect) complete.
  // Match Tauri ChildProcessSpawnerLive: end on close; also honor stream End events.
  const endQueues = Effect.gen(function* () {
    yield* Queue.end(stdoutQueue).pipe(Effect.ignore);
    yield* Queue.end(stderrQueue).pipe(Effect.ignore);
  });

  client.registerProcess(handleId, {
    onExit: code => {
      runningRef.current = false;
      runFork(
        Effect.gen(function* () {
          yield* Deferred.succeed(exitDeferred, ChildProcessSpawner.ExitCode(code));
          yield* endQueues;
        }),
      );
    },
    onStderrChunk: chunk => {
      runFork(Queue.offer(stderrQueue, chunk));
    },
    onStderrEnd: () => {
      runFork(Queue.end(stderrQueue).pipe(Effect.ignore));
    },
    onStdoutChunk: chunk => {
      runFork(Queue.offer(stdoutQueue, chunk));
    },
    onStdoutEnd: () => {
      runFork(Queue.end(stdoutQueue).pipe(Effect.ignore));
    },
  });

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      if (runningRef.current) {
        yield* client.request(id => ({ _tag: 'Kill' as const, handleId, id })).pipe(Effect.ignore);
      }
      client.unregisterProcess(handleId);
      yield* Queue.shutdown(stdoutQueue);
      yield* Queue.shutdown(stderrQueue);
    }),
  );

  const stdout = Stream.fromQueue(stdoutQueue);
  // inherit: empty stream that completes when the process exits (plan Q6).
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
      client
        .request(id => ({ _tag: 'Kill' as const, handleId, id }))
        .pipe(
          Effect.mapError(cause => mapSpawnError('kill', cause)),
          Effect.tap(() =>
            Effect.sync(() => {
              runningRef.current = false;
            }),
          ),
          Effect.asVoid,
        ),
    pid: ChildProcessSpawner.ProcessId(pid),
    stderr,
    stdin: Sink.forEach((chunk: Uint8Array) =>
      Effect.sync(() => {
        client.post({ _tag: 'StdinChunk', bytes: bytesToArrayBuffer(chunk), handleId });
      }),
    ),
    stdout,
    unref: Effect.succeed(Effect.void),
  });
});

export const makeChildProcessSpawnerLive = (client: IpcClient): Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(command => {
      if (command._tag === 'PipedCommand') {
        return Effect.fail(
          PlatformError.badArgument({
            description: 'Piped commands are not supported by the vscode webview ChildProcessSpawner Live',
            method: 'spawn',
            module: 'ChildProcess',
          }),
        );
      }
      return spawnStandard(client, command);
    }),
  );

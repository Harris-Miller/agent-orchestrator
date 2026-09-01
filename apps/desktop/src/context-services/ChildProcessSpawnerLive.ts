/**
 * Tauri-backed `ChildProcessSpawner` via `@tauri-apps/plugin-shell`.
 *
 * Bridges Effect's stdin Sink / stdout+stderr Streams to Tauri `Command` events
 * and `Child.write` / `Child.kill`. Piped commands are not supported.
 * `extendEnv` merges host env from {@link OS}.env.
 */
import { OS } from '@lib/context-services';
import { Command } from '@tauri-apps/plugin-shell';
import { Deferred, Effect, Layer, Queue, Sink, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/unstable/process';
import type { Command as EffectCommand } from 'effect/unstable/process/ChildProcess';

const mapSpawnError = (method: string, cause: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    cause,
    description: cause instanceof Error ? cause.message : String(cause),
    method,
    module: 'ChildProcess',
  });

/**
 * Normalize Tauri shell stdout/stderr payloads to `Uint8Array`.
 * With `encoding: 'raw'`, IPC delivers `number[]` (not `Uint8Array`).
 */
const encodeChunk = (chunk: unknown): Uint8Array => {
  if (typeof chunk === 'string') {
    return new TextEncoder().encode(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  if (Array.isArray(chunk)) {
    return Uint8Array.from(chunk as unknown[]);
  }
  throw new TypeError(`Unsupported shell IO chunk: ${Object.prototype.toString.call(chunk)}`);
};

const spawnStandard = Effect.fn('TauriChildProcessSpawner.spawn')(function* (
  command: Extract<EffectCommand, { readonly _tag: 'StandardCommand' }>,
  hostEnv: Readonly<Record<string, string>>,
) {
  const stdoutQueue = yield* Queue.unbounded<Uint8Array, PlatformError.PlatformError>();
  const stderrQueue = yield* Queue.unbounded<Uint8Array, PlatformError.PlatformError>();
  const exitDeferred = yield* Deferred.make<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>();
  const runningRef = { current: true };

  const envEntries = command.options.env ?? {};
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envEntries)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (command.options.extendEnv === true) {
    for (const [key, value] of Object.entries(hostEnv)) {
      if (!(key in env)) {
        env[key] = value;
      }
    }
  }

  const tauriCommand = Command.create(command.command, [...command.args], {
    cwd: command.options.cwd,
    encoding: 'raw',
    ...(Object.keys(env).length > 0 ? { env } : {}),
  });

  // Callbacks leave the Effect fiber; reuse surrounding services via runForkWith.
  // Do not shutdown stdout/stderr queues on close — Queue.shutdown interrupts
  // active Stream.fromQueue readers. Scope finalizers shut the queues down.
  const runFork = Effect.runForkWith(yield* Effect.context());
  tauriCommand.on('close', payload => {
    runningRef.current = false;
    const code = payload.code ?? (payload.signal !== null ? 1 : 0);
    runFork(Deferred.succeed(exitDeferred, ChildProcessSpawner.ExitCode(code)));
  });

  tauriCommand.on('error', message => {
    runningRef.current = false;
    runFork(Deferred.fail(exitDeferred, mapSpawnError('spawn', new Error(message))));
  });

  tauriCommand.stdout.on('data', (data: number[] | Uint8Array) => {
    try {
      runFork(Queue.offer(stdoutQueue, encodeChunk(data)));
    } catch (cause) {
      runFork(Queue.fail(stdoutQueue, mapSpawnError('stdout', cause)));
    }
  });

  tauriCommand.stderr.on('data', (data: number[] | Uint8Array) => {
    try {
      runFork(Queue.offer(stderrQueue, encodeChunk(data)));
    } catch (cause) {
      runFork(Queue.fail(stderrQueue, mapSpawnError('stderr', cause)));
    }
  });

  const child = yield* Effect.tryPromise({
    catch: cause => mapSpawnError('spawn', cause),
    try: () => tauriCommand.spawn(),
  });

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      if (runningRef.current) {
        yield* Effect.tryPromise({
          catch: cause => mapSpawnError('kill', cause),
          try: () => child.kill(),
        }).pipe(Effect.ignore);
      }
      yield* Queue.shutdown(stdoutQueue);
      yield* Queue.shutdown(stderrQueue);
    }),
  );

  const stdout = Stream.fromQueue(stdoutQueue);
  const stderr = Stream.fromQueue(stderrQueue);

  return ChildProcessSpawner.makeHandle({
    all: Stream.merge(stdout, stderr),
    exitCode: Deferred.await(exitDeferred),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    isRunning: Effect.sync(() => runningRef.current),
    kill: () =>
      Effect.tryPromise({
        catch: cause => mapSpawnError('kill', cause),
        try: () => child.kill(),
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            runningRef.current = false;
          }),
        ),
      ),
    pid: ChildProcessSpawner.ProcessId(child.pid),
    stderr,
    stdin: Sink.forEach(chunk =>
      Effect.tryPromise({
        catch: cause => mapSpawnError('stdin', cause),
        try: () => child.write(Array.from(chunk)),
      }),
    ),
    stdout,
    unref: Effect.succeed(Effect.void),
  });
});

const makeSpawn =
  (hostEnv: Readonly<Record<string, string>>): ChildProcessSpawner.ChildProcessSpawner['Service']['spawn'] =>
  command => {
    if (command._tag === 'PipedCommand') {
      return Effect.fail(
        PlatformError.badArgument({
          description: 'Piped commands are not supported by the Tauri ChildProcessSpawner Live',
          method: 'spawn',
          module: 'ChildProcess',
        }),
      );
    }
    return spawnStandard(command, hostEnv);
  };

/** Tauri `ChildProcessSpawner` Layer (requires {@link OS} for extendEnv). */
export const ChildProcessSpawnerLive: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner, never, OS> = Layer.effect(
  ChildProcessSpawner.ChildProcessSpawner,
  Effect.gen(function* () {
    const os = yield* OS;
    return ChildProcessSpawner.make(makeSpawn(os.env()));
  }),
);

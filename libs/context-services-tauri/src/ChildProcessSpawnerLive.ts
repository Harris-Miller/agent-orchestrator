/**
 * Tauri-backed `ChildProcessSpawner` via `@tauri-apps/plugin-shell`.
 *
 * Bridges Effect's stdin Sink / stdout+stderr Streams to Tauri `Command` events
 * and `Child.write` / `Child.kill`. Piped commands are not supported.
 * `extendEnv` merges host env from {@link OS}.env.
 *
 * Spawned PIDs are registered with the Tauri host (`track_child_process`) so a
 * WebView reload can reap orphans whose Effect finalizers never ran.
 */
import { OS } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import type { Cause } from 'effect';
import { Context, Deferred, Effect, Layer, Queue, Sink, Stream, Tracer } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/unstable/process';
import type { Command as EffectCommand } from 'effect/unstable/process/ChildProcess';

const trackChildProcess = (pid: number): void => {
  invoke('track_child_process', { pid }).then(
    () => undefined,
    () => undefined,
  );
};

const untrackChildProcess = (pid: number): void => {
  invoke('untrack_child_process', { pid }).then(
    () => undefined,
    () => undefined,
  );
};

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

const spawnStandard = Effect.fnUntraced(
  function* (
    command: Extract<EffectCommand, { readonly _tag: 'StandardCommand' }>,
    hostEnv: Readonly<Record<string, string>>,
  ) {
    yield* Effect.logInfo('Spawning child process', command.command, command.args.join(' '));
    const stdoutQueue = yield* Queue.unbounded<Uint8Array, Cause.Done | PlatformError.PlatformError>();
    const stderrQueue = yield* Queue.unbounded<Uint8Array, Cause.Done | PlatformError.PlatformError>();
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
    // Complete stdout/stderr with Queue.end on close (not Queue.shutdown) so
    // Stream.fromQueue readers finish; scope finalizers still shutdown as cleanup.
    // Omit ParentSpan so Tauri callbacks do not inherit spawn/connect as forever parents.
    const runFork = Effect.runForkWith(Context.omit(Tracer.ParentSpan)(yield* Effect.context()));
    const trackedPid = { current: undefined as number | undefined };

    tauriCommand.on('close', payload => {
      runningRef.current = false;
      if (trackedPid.current !== undefined) {
        untrackChildProcess(trackedPid.current);
        trackedPid.current = undefined;
      }
      const code = payload.code ?? (payload.signal !== null ? 1 : 0);
      runFork(
        Effect.gen(function* () {
          yield* Effect.logDebug('Child process closed', { code, signal: payload.signal });
          yield* Deferred.succeed(exitDeferred, ChildProcessSpawner.ExitCode(code));
          yield* Queue.end(stdoutQueue);
          yield* Queue.end(stderrQueue);
        }),
      );
    });

    tauriCommand.on('error', message => {
      runningRef.current = false;
      if (trackedPid.current !== undefined) {
        untrackChildProcess(trackedPid.current);
        trackedPid.current = undefined;
      }
      runFork(
        Effect.gen(function* () {
          yield* Effect.logError('Child process error event', message);
          yield* Deferred.fail(exitDeferred, mapSpawnError('spawn', new Error(message)));
          yield* Queue.end(stdoutQueue);
          yield* Queue.end(stderrQueue);
        }),
      );
    });

    // Sync offers so chunks land before close's Queue.end (avoids post-exit sleep hacks).
    tauriCommand.stdout.on('data', (data: number[] | Uint8Array) => {
      try {
        Queue.offerUnsafe(stdoutQueue, encodeChunk(data));
      } catch (cause) {
        runFork(
          Effect.logWarning('Child stdout chunk encode failed', cause).pipe(
            Effect.andThen(Queue.fail(stdoutQueue, mapSpawnError('stdout', cause))),
          ),
        );
      }
    });

    tauriCommand.stderr.on('data', (data: number[] | Uint8Array) => {
      try {
        Queue.offerUnsafe(stderrQueue, encodeChunk(data));
      } catch (cause) {
        runFork(
          Effect.logWarning('Child stderr chunk encode failed', cause).pipe(
            Effect.andThen(Queue.fail(stderrQueue, mapSpawnError('stderr', cause))),
          ),
        );
      }
    });

    const child = yield* Effect.tryPromise({
      catch: cause => mapSpawnError('spawn', cause),
      try: () => tauriCommand.spawn(),
    }).pipe(Effect.tapError(error => Effect.logError('Child spawn failed', error.message)));

    trackedPid.current = child.pid;
    trackChildProcess(child.pid);
    yield* Effect.logInfo('Child process spawned', { command: command.command, pid: child.pid });

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logDebug('Child process finalizer', { pid: child.pid, running: runningRef.current });
        if (runningRef.current) {
          untrackChildProcess(child.pid);
          trackedPid.current = undefined;
          yield* Effect.tryPromise({
            catch: cause => mapSpawnError('kill', cause),
            try: () => child.kill(),
          }).pipe(
            Effect.tapError(error => Effect.logWarning('Child kill during finalizer failed', error.message)),
            Effect.ignore,
          );
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
        Effect.gen(function* () {
          yield* Effect.logInfo('Killing child process', { pid: child.pid });
          untrackChildProcess(child.pid);
          trackedPid.current = undefined;
          yield* Effect.tryPromise({
            catch: cause => mapSpawnError('kill', cause),
            try: () => child.kill(),
          }).pipe(Effect.tapError(error => Effect.logError('Child kill failed', error.message)));
          runningRef.current = false;
        }),
      pid: ChildProcessSpawner.ProcessId(child.pid),
      stderr,
      stdin: Sink.forEach(chunk =>
        Effect.tryPromise({
          catch: cause => mapSpawnError('stdin', cause),
          try: () => child.write(Array.from(chunk)),
        }).pipe(Effect.tapError(error => Effect.logWarning('Child stdin write failed', error.message))),
      ),
      stdout,
      unref: Effect.succeed(Effect.void),
    });
  },
  Effect.withSpan('TauriChildProcessSpawner.spawn'),
  Effect.annotateLogs({ module: 'ChildProcessSpawnerLive' }),
);

const makeSpawn =
  (hostEnv: Readonly<Record<string, string>>): ChildProcessSpawner.ChildProcessSpawner['Service']['spawn'] =>
  command => {
    if (command._tag === 'PipedCommand') {
      return Effect.logWarning('Piped commands are not supported by Tauri ChildProcessSpawner').pipe(
        Effect.andThen(
          Effect.fail(
            PlatformError.badArgument({
              description: 'Piped commands are not supported by the Tauri ChildProcessSpawner Live',
              method: 'spawn',
              module: 'ChildProcess',
            }),
          ),
        ),
      );
    }
    return spawnStandard(command, hostEnv);
  };

/** Tauri `ChildProcessSpawner` Layer (requires {@link OS} for extendEnv). */
export const ChildProcessSpawnerLive: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner, never, OS> = Layer.effect(
  ChildProcessSpawner.ChildProcessSpawner,
  Effect.gen(function* () {
    yield* Effect.logDebug('Installing Tauri ChildProcessSpawner');
    const os = yield* OS;
    return ChildProcessSpawner.make(makeSpawn(os.env()));
  }),
);

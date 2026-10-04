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
import { mapSpawnError, openQueuedChildProcessStdio, OS } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import { Effect, Layer } from 'effect';
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

    const stdio = yield* openQueuedChildProcessStdio();
    const trackedPid = { current: undefined as number | undefined };

    tauriCommand.on('close', payload => {
      if (trackedPid.current !== undefined) {
        untrackChildProcess(trackedPid.current);
        trackedPid.current = undefined;
      }
      const code = payload.code ?? (payload.signal !== null ? 1 : 0);
      stdio.onExit(code);
    });

    tauriCommand.on('error', message => {
      if (trackedPid.current !== undefined) {
        untrackChildProcess(trackedPid.current);
        trackedPid.current = undefined;
      }
      stdio.onSpawnError(new Error(message));
    });

    // Sync offers so chunks land before close's Queue.end (avoids post-exit sleep hacks).
    tauriCommand.stdout.on('data', (data: number[] | Uint8Array) => {
      try {
        stdio.onStdoutChunk(encodeChunk(data));
      } catch (cause) {
        stdio.onStdoutFail(cause);
      }
    });

    tauriCommand.stderr.on('data', (data: number[] | Uint8Array) => {
      try {
        stdio.onStderrChunk(encodeChunk(data));
      } catch (cause) {
        stdio.onStderrFail(cause);
      }
    });

    const child = yield* Effect.tryPromise({
      catch: cause => mapSpawnError('spawn', cause),
      try: () => tauriCommand.spawn(),
    }).pipe(Effect.tapError(error => Effect.logError('Child spawn failed', error.message)));

    trackedPid.current = child.pid;
    trackChildProcess(child.pid);
    yield* Effect.logInfo('Child process spawned', { command: command.command, pid: child.pid });

    return yield* stdio.finalize({
      kill: Effect.gen(function* () {
        yield* Effect.logInfo('Killing child process', { pid: child.pid });
        untrackChildProcess(child.pid);
        trackedPid.current = undefined;
        yield* Effect.tryPromise({
          catch: cause => mapSpawnError('kill', cause),
          try: () => child.kill(),
        }).pipe(Effect.tapError(error => Effect.logError('Child kill failed', error.message)));
      }),
      pid: child.pid,
      writeStdin: chunk =>
        Effect.tryPromise({
          catch: cause => mapSpawnError('stdin', cause),
          try: () => child.write(Array.from(chunk)),
        }).pipe(Effect.tapError(error => Effect.logWarning('Child stdin write failed', error.message))),
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

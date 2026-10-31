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
import { Channel, invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import { Effect, Layer } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';
import type { Command as EffectCommand } from 'effect/process/ChildProcess';

import { npmScopeNameFor } from './mapNpmScope.ts';

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

/** Logical name of the Antigravity ACP server (`ANTIGRAVITY_ACP_SPAWN_NAME` in `@lib/ao-home`). */
const ANTIGRAVITY_SPAWN_NAME = 'agy_acp_server';

type ProviderEvent =
  | { readonly data: { readonly code: number }; readonly event: 'exit' }
  | { readonly data: unknown; readonly event: 'stderr' | 'stdout' };

/**
 * Antigravity is spawned by the constrained `spawn_antigravity_provider` Rust command, which reads the active
 * runtime's command and arguments from `current.json` itself (no symlink, never a webview-supplied path).
 * Stdio and exit arrive over a Channel; kill goes through the tracked process-tree kill.
 */
const spawnAntigravityProvider = Effect.fnUntraced(function* (
  command: Extract<EffectCommand, { readonly _tag: 'StandardCommand' }>,
) {
  yield* Effect.logInfo('Spawning Antigravity provider');
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(command.options.env ?? {})) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  const stdio = yield* openQueuedChildProcessStdio();
  const channel = new Channel<ProviderEvent>();
  channel.onmessage = message => {
    try {
      switch (message.event) {
        case 'stdout':
          stdio.onStdoutChunk(encodeChunk(message.data));
          break;
        case 'stderr':
          stdio.onStderrChunk(encodeChunk(message.data));
          break;
        case 'exit':
          stdio.onExit(message.data.code);
          break;
      }
    } catch (cause) {
      stdio.onStdoutFail(cause);
    }
  };
  const pid = yield* Effect.tryPromise({
    catch: cause => mapSpawnError('spawn', cause),
    try: () => invoke<number>('spawn_antigravity_provider', { env, onEvent: channel }),
  }).pipe(Effect.tapError(error => Effect.logError('Antigravity spawn failed', error.message)));
  return yield* stdio.finalize({
    kill: Effect.tryPromise({
      catch: cause => mapSpawnError('kill', cause),
      try: () => invoke('kill_tracked_process_tree', { pid }),
    }).pipe(Effect.asVoid),
    pid,
    writeStdin: chunk =>
      Effect.tryPromise({
        catch: cause => mapSpawnError('stdin', cause),
        try: () => invoke('write_provider_stdin', { data: Array.from(chunk), pid }),
      }).pipe(Effect.asVoid),
  });
});

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

    // `npm` is spawned only as one of the three provider operations, each with its own pinned scope.
    const scopeName = command.command === 'npm' ? npmScopeNameFor(command.args) : command.command;
    if (scopeName === undefined) {
      return yield* PlatformError.badArgument({
        description: `Refusing to spawn npm with arguments outside the provider operations: ${command.args.join(' ')}`,
        method: 'spawn',
        module: 'ChildProcess',
      });
    }

    const tauriCommand = Command.create(scopeName, [...command.args], {
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
        // Tree kill first (needs the tracked pid); falls back to the plain kill below on failure / non-unix.
        yield* Effect.promise(() =>
          invoke('kill_tracked_process_tree', { pid: child.pid }).then(
            () => undefined,
            () => undefined,
          ),
        );
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
    return command.command === ANTIGRAVITY_SPAWN_NAME
      ? spawnAntigravityProvider(command)
      : spawnStandard(command, hostEnv);
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

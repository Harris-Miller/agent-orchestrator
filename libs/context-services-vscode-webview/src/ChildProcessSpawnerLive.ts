/**
 * Webview ChildProcessSpawner over extension↔webview IPC.
 */
import { mapSpawnError, openQueuedChildProcessStdio } from '@lib/context-services';
import { Effect, Layer, Redacted } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';
import type { Command as EffectCommand } from 'effect/process/ChildProcess';

import type { IpcClient } from './protocol/ipcClient.ts';
import { bytesToArrayBuffer } from './protocol/messages.ts';

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
  const stderrMode = command.options.stderr ?? 'pipe';
  const stdio = yield* openQueuedChildProcessStdio({
    stderrMode: stderrMode === 'inherit' ? 'inherit' : 'pipe',
  });

  const env = Object.fromEntries(
    Object.entries(command.options.env ?? {}).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, Redacted.isRedacted(value) ? Redacted.value(value) : value]],
    ),
  );
  const response = yield* client
    .request({
      _tag: 'Spawn',
      args: command.args.map(arg => (Redacted.isRedacted(arg) ? Redacted.value(arg) : arg)),
      command: command.command,
      options: {
        cwd: command.options.cwd,
        env,
        extendEnv: command.options.extendEnv,
        stderr: toStdioMode(command.options.stderr),
        stdin: toStdioMode(command.options.stdin),
        stdout: toStdioMode(command.options.stdout),
      },
    })
    .pipe(Effect.mapError(cause => mapSpawnError('spawn', cause)));

  const { handleId, pid } = response;

  client.registerProcess(handleId, {
    onExit: code => {
      stdio.onExit(code);
    },
    onStderrChunk: chunk => {
      stdio.onStderrChunk(chunk);
    },
    onStderrEnd: () => {
      stdio.onStderrEnd();
    },
    onStdoutChunk: chunk => {
      stdio.onStdoutChunk(chunk);
    },
    onStdoutEnd: () => {
      stdio.onStdoutEnd();
    },
  });

  const handle = yield* stdio.finalize({
    kill: client.request({ _tag: 'Kill', handleId }).pipe(
      Effect.mapError(cause => mapSpawnError('kill', cause)),
      Effect.asVoid,
    ),
    pid,
    writeStdin: chunk =>
      Effect.sync(() => {
        client.post({ _tag: 'StdinChunk', bytes: bytesToArrayBuffer(chunk), handleId });
      }),
  });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      client.unregisterProcess(handleId);
    }),
  );

  return handle;
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

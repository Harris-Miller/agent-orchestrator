import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer, Sink, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

import { requireVendorCliAuthenticated } from './vendorCliAuth.ts';

const osLayer = (env: Readonly<Record<string, string>> = {}) =>
  Layer.succeed(OS, {
    arch: () => 'arm64',
    cwd: () => '/home/operator',
    env: () => env,
    homedir: () => '/home/operator',
    platform: () => 'linux',
  });

const mockSpawnerLayer = (opts: { readonly exitCode: number; readonly stdout: string }) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => {
      const bytes = new TextEncoder().encode(opts.stdout);
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.make(bytes),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(opts.exitCode)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          // Never-ending stdout mirrors Tauri queues that do not close on process exit.
          stdout: Stream.concat(Stream.make(bytes), Stream.never),
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );

const failingSpawnLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.fail(
      PlatformError.systemError({
        _tag: 'Unknown',
        description: 'spawn failed',
        method: 'spawn',
        module: 'ChildProcess',
      }),
    ),
  ),
);

const provideAuth = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  spawner: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>,
  env: Readonly<Record<string, string>> = {},
) => effect.pipe(Effect.provide(Layer.mergeAll(osLayer(env), spawner)));

describe('requireVendorCliAuthenticated', () => {
  it.effect('codex: exit 0 succeeds', () =>
    provideAuth(
      requireVendorCliAuthenticated('codex-acp', '/usr/local/bin/codex'),
      mockSpawnerLayer({ exitCode: 0, stdout: 'Logged in\n' }),
    ),
  );

  it.effect('codex: exit 1 → MissingLaunchPrerequisite auth message', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('codex-acp', '/usr/local/bin/codex').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'codex');
      assert.strictEqual(error.message, '`codex` is not authenticated — run `codex login`');
    }).pipe(Effect.provide(Layer.mergeAll(osLayer(), mockSpawnerLayer({ exitCode: 1, stdout: 'Not logged in\n' })))),
  );

  it.effect('codex: spawn failure → could not verify', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('codex-acp', '/usr/local/bin/codex').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.message, 'Could not verify authentication for `codex`');
    }).pipe(Effect.provide(Layer.mergeAll(osLayer(), failingSpawnLayer))),
  );

  it.effect('claude: loggedIn true succeeds', () =>
    provideAuth(
      requireVendorCliAuthenticated('claude-agent-acp', '/usr/local/bin/claude'),
      mockSpawnerLayer({ exitCode: 0, stdout: JSON.stringify({ loggedIn: true }) }),
    ),
  );

  it.effect('claude: succeeds when stdout arrives after exitCode', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ loggedIn: true }));
    const delayedStdoutLayer = Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() =>
        Effect.succeed(
          ChildProcessSpawner.makeHandle({
            all: Stream.empty,
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            pid: ChildProcessSpawner.ProcessId(1),
            stderr: Stream.empty,
            stdin: Sink.drain,
            stdout: Stream.concat(
              Stream.fromEffect(
                Effect.promise(
                  () =>
                    new Promise<Uint8Array>(resolve => {
                      setTimeout(() => {
                        resolve(bytes);
                      }, 20);
                    }),
                ),
              ),
              Stream.never,
            ),
            unref: Effect.succeed(Effect.void),
          }),
        ),
      ),
    );
    return provideAuth(requireVendorCliAuthenticated('claude-agent-acp', '/usr/local/bin/claude'), delayedStdoutLayer);
  });

  it.effect('claude: loggedIn false → MissingLaunchPrerequisite auth message', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('claude-agent-acp', '/usr/local/bin/claude').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'claude');
      assert.strictEqual(error.message, '`claude` is not authenticated — run `claude auth login`');
    }).pipe(
      Effect.provide(
        Layer.mergeAll(osLayer(), mockSpawnerLayer({ exitCode: 0, stdout: JSON.stringify({ loggedIn: false }) })),
      ),
    ),
  );

  it.effect('claude: invalid JSON → could not verify', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('claude-agent-acp', '/usr/local/bin/claude').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.message, 'Could not verify authentication for `claude`');
    }).pipe(Effect.provide(Layer.mergeAll(osLayer(), mockSpawnerLayer({ exitCode: 0, stdout: 'not-json' })))),
  );

  it.effect('claude: spawn failure → could not verify', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('claude-agent-acp', '/usr/local/bin/claude').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.message, 'Could not verify authentication for `claude`');
    }).pipe(Effect.provide(Layer.mergeAll(osLayer(), failingSpawnLayer))),
  );

  it.effect('cursor: CURSOR_API_KEY short-circuits without spawn', () =>
    provideAuth(requireVendorCliAuthenticated('cursor-acp', '/usr/local/bin/cursor-agent'), failingSpawnLayer, {
      CURSOR_API_KEY: 'test-key',
    }),
  );

  it.effect('cursor: CURSOR_AUTH_TOKEN short-circuits without spawn', () =>
    provideAuth(requireVendorCliAuthenticated('cursor-acp', '/usr/local/bin/cursor-agent'), failingSpawnLayer, {
      CURSOR_AUTH_TOKEN: 'test-token',
    }),
  );

  it.effect('cursor: isAuthenticated true succeeds', () =>
    provideAuth(
      requireVendorCliAuthenticated('cursor-acp', '/usr/local/bin/cursor-agent'),
      mockSpawnerLayer({ exitCode: 0, stdout: JSON.stringify({ isAuthenticated: true }) }),
    ),
  );

  it.effect('cursor: isAuthenticated false → MissingLaunchPrerequisite auth message', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('cursor-acp', '/usr/local/bin/cursor-agent').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'cursor-agent');
      assert.strictEqual(error.message, '`cursor-agent` is not authenticated — run `cursor-agent login`');
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          osLayer(),
          mockSpawnerLayer({ exitCode: 0, stdout: JSON.stringify({ isAuthenticated: false }) }),
        ),
      ),
    ),
  );

  it.effect('cursor: invalid JSON → could not verify', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('cursor-acp', '/usr/local/bin/cursor-agent').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.message, 'Could not verify authentication for `cursor-agent`');
    }).pipe(Effect.provide(Layer.mergeAll(osLayer(), mockSpawnerLayer({ exitCode: 0, stdout: 'not-json' })))),
  );

  it.effect('cursor: spawn failure → could not verify', () =>
    Effect.gen(function* () {
      const error = yield* requireVendorCliAuthenticated('cursor-acp', '/usr/local/bin/cursor-agent').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.message, 'Could not verify authentication for `cursor-agent`');
    }).pipe(Effect.provide(Layer.mergeAll(osLayer(), failingSpawnLayer))),
  );
});

import { assert, describe, it } from '@effect/vitest';
import { BundledResource, OS } from '@lib/context-services';
import { PathLive } from '@lib/context-services-tauri';
import { Effect, Layer, Option, Sink, Stream } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/unstable/process';

import { makeAcpAdapterCommand } from './acpAdapterCommand.ts';
import { findExecutableOnPath, requireExecutableOnPath } from './findExecutableOnPath.ts';

const osLayer = (env: Readonly<Record<string, string>>, platform = 'linux') =>
  Layer.succeed(OS, {
    cwd: () => '/home/operator',
    env: () => env,
    homedir: () => '/home/operator',
    platform: () => platform,
  });

const fsLayer = (existing: ReadonlySet<string>) =>
  layerNoop({
    exists: path => Effect.succeed(existing.has(path)),
  });

const bundledResourceLayer = Layer.succeed(BundledResource, {
  resolve: (resourcePath: string) => Effect.succeed(`/resources/${resourcePath}`),
});

const authOkSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(command => {
    const isClaude = command._tag === 'StandardCommand' && command.args.includes('auth');
    const stdout = isClaude
      ? new TextEncoder().encode(JSON.stringify({ loggedIn: true }))
      : new TextEncoder().encode('Logged in\n');
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        all: Stream.make(stdout),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        pid: ChildProcessSpawner.ProcessId(1),
        stderr: Stream.empty,
        stdin: Sink.drain,
        stdout: Stream.make(stdout),
        unref: Effect.succeed(Effect.void),
      }),
    );
  }),
);

const authFailSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.succeed(
      ChildProcessSpawner.makeHandle({
        all: Stream.make(new TextEncoder().encode('Not logged in\n')),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(1)),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        pid: ChildProcessSpawner.ProcessId(1),
        stderr: Stream.empty,
        stdin: Sink.drain,
        stdout: Stream.make(new TextEncoder().encode('Not logged in\n')),
        unref: Effect.succeed(Effect.void),
      }),
    ),
  ),
);

const pathServices = (env: Readonly<Record<string, string>>, existing: ReadonlySet<string>, platform = 'linux') => {
  const pathLayer = platform === 'win32' ? PathLive.pipe(Layer.provide(osLayer(env, platform))) : posixPathLayer;
  return Layer.mergeAll(pathLayer, fsLayer(existing)).pipe(Layer.provideMerge(osLayer(env, platform)));
};

const adapterServices = (
  env: Readonly<Record<string, string>>,
  existing: ReadonlySet<string>,
  authLayer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> = authOkSpawnerLayer,
) => Layer.mergeAll(pathServices(env, existing), authLayer, bundledResourceLayer);

describe('findExecutableOnPath', () => {
  it.effect('returns the first matching PATH entry', () =>
    Effect.gen(function* () {
      const found = yield* findExecutableOnPath('codex');
      assert.isTrue(Option.isSome(found));
      assert.strictEqual(Option.getOrThrow(found), '/opt/bin/codex');
    }).pipe(
      Effect.provide(
        pathServices({ PATH: '/missing/bin:/opt/bin:/usr/bin' }, new Set(['/opt/bin/codex', '/usr/bin/codex'])),
      ),
    ),
  );

  it.effect('returns none when missing', () =>
    Effect.gen(function* () {
      const found = yield* findExecutableOnPath('claude');
      assert.isTrue(Option.isNone(found));
    }).pipe(Effect.provide(pathServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/node'])))),
  );

  it.effect('skips candidates when exists fails and keeps scanning', () => {
    const pathLayer = posixPathLayer;
    const os = osLayer({ PATH: '/forbidden/bin:/opt/bin' });
    const fs = layerNoop({
      exists: candidate =>
        candidate.startsWith('/forbidden')
          ? Effect.fail(
              PlatformError.systemError({
                _tag: 'Unknown',
                description: 'forbidden path',
                method: 'exists',
                module: 'FileSystem',
                pathOrDescriptor: candidate,
              }),
            )
          : Effect.succeed(candidate === '/opt/bin/codex'),
    });
    return Effect.gen(function* () {
      const found = yield* findExecutableOnPath('codex');
      assert.isTrue(Option.isSome(found));
      assert.strictEqual(Option.getOrThrow(found), '/opt/bin/codex');
    }).pipe(Effect.provide(Layer.mergeAll(pathLayer, fs).pipe(Layer.provideMerge(os))));
  });

  it.effect('checks win32 extensions', () =>
    Effect.gen(function* () {
      const found = yield* findExecutableOnPath('codex');
      assert.isTrue(Option.isSome(found));
      assert.strictEqual(Option.getOrThrow(found), 'C:\\Tools\\codex.exe');
    }).pipe(
      Effect.provide(pathServices({ PATH: 'C:\\Tools;C:\\Windows' }, new Set(['C:\\Tools\\codex.exe']), 'win32')),
    ),
  );

  it.effect('requireExecutableOnPath fails with MissingLaunchPrerequisite', () =>
    Effect.gen(function* () {
      const error = yield* requireExecutableOnPath('claude').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'claude');
      assert.strictEqual(error.message, '`claude` not found on PATH');
    }).pipe(Effect.provide(pathServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/node'])))),
  );
});

describe('makeAcpAdapterCommand', () => {
  it.effect('builds node + entry with CODEX_PATH when prerequisites exist', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpAdapterCommand('codex-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'node');
      assert.deepStrictEqual(command.args, [
        '/resources/acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
      ]);
      assert.strictEqual(command.options.env?.CODEX_PATH, '/usr/local/bin/codex');
    }).pipe(
      Effect.provide(
        adapterServices(
          { PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/bin/node', '/usr/local/bin/codex', '/usr/local/bin/node']),
        ),
      ),
    ),
  );

  it.effect('builds node + entry with CLAUDE_CODE_EXECUTABLE when prerequisites exist', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpAdapterCommand('claude-agent-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'node');
      assert.strictEqual(command.options.env?.CLAUDE_CODE_EXECUTABLE, '/usr/local/bin/claude');
    }).pipe(
      Effect.provide(
        adapterServices({ PATH: '/usr/local/bin:/usr/bin' }, new Set(['/usr/local/bin/claude', '/usr/local/bin/node'])),
      ),
    ),
  );

  it.effect('fails without spawning when vendor CLI is missing', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpAdapterCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'codex');
    }).pipe(Effect.provide(adapterServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/node'])))),
  );

  it.effect('fails when node is missing', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpAdapterCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'node');
    }).pipe(Effect.provide(adapterServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/codex'])))),
  );

  it.effect('fails when vendor CLI is present but unauthenticated', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpAdapterCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'codex');
      assert.strictEqual(error.message, '`codex` is not authenticated — run `codex login`');
    }).pipe(
      Effect.provide(
        adapterServices(
          { PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/bin/node', '/usr/local/bin/codex', '/usr/local/bin/node']),
          authFailSpawnerLayer,
        ),
      ),
    ),
  );
});

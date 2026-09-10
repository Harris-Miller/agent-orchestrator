import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { PathLive } from '@lib/context-services-tauri';
import { resolveResource } from '@tauri-apps/api/path';
import { Effect, Layer, Option } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import { beforeEach, vi } from 'vitest';

import { makeAcpAdapterCommand } from './acpAdapterCommand.ts';
import { findExecutableOnPath, requireExecutableOnPath } from './findExecutableOnPath.ts';

vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: vi.fn(),
}));

const mockedResolveResource = vi.mocked(resolveResource);

beforeEach(() => {
  mockedResolveResource.mockReset();
});

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

const pathServices = (env: Readonly<Record<string, string>>, existing: ReadonlySet<string>, platform = 'linux') => {
  const pathLayer = platform === 'win32' ? PathLive.pipe(Layer.provide(osLayer(env, platform))) : posixPathLayer;
  return Layer.mergeAll(pathLayer, fsLayer(existing)).pipe(Layer.provideMerge(osLayer(env, platform)));
};

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
      if (error._tag !== 'MissingLaunchPrerequisite') {
        return;
      }
      assert.strictEqual(error.executable, 'claude');
      assert.strictEqual(error.message, '`claude` not found on PATH');
    }).pipe(Effect.provide(pathServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/node'])))),
  );
});

describe('makeAcpAdapterCommand', () => {
  it.effect('builds node + entry with CODEX_PATH when prerequisites exist', () =>
    Effect.gen(function* () {
      mockedResolveResource.mockResolvedValue(
        '/resources/acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
      );
      const command = yield* makeAcpAdapterCommand('codex-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'node');
      assert.deepStrictEqual(command.args, [
        '/resources/acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
      ]);
      assert.strictEqual(command.options.env?.CODEX_PATH, '/usr/local/bin/codex');
    }).pipe(
      Effect.provide(
        pathServices(
          { PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/bin/node', '/usr/local/bin/codex', '/usr/local/bin/node']),
        ),
      ),
    ),
  );

  it.effect('builds node + entry with CLAUDE_CODE_EXECUTABLE when prerequisites exist', () =>
    Effect.gen(function* () {
      mockedResolveResource.mockResolvedValue(
        '/resources/acp-adapter-resources/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
      );
      const command = yield* makeAcpAdapterCommand('claude-agent-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'node');
      assert.strictEqual(command.options.env?.CLAUDE_CODE_EXECUTABLE, '/usr/local/bin/claude');
    }).pipe(
      Effect.provide(
        pathServices({ PATH: '/usr/local/bin:/usr/bin' }, new Set(['/usr/local/bin/claude', '/usr/local/bin/node'])),
      ),
    ),
  );

  it.effect('fails without spawning when vendor CLI is missing', () =>
    Effect.gen(function* () {
      mockedResolveResource.mockResolvedValue(
        '/resources/acp-adapter-resources/node_modules/@agentclientprotocol/codex-acp/dist/index.js',
      );
      const error = yield* makeAcpAdapterCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      if (error._tag !== 'MissingLaunchPrerequisite') {
        return;
      }
      assert.strictEqual(error.executable, 'codex');
      assert.strictEqual(mockedResolveResource.mock.calls.length, 1);
    }).pipe(Effect.provide(pathServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/node'])))),
  );

  it.effect('fails when node is missing', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpAdapterCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      if (error._tag !== 'MissingLaunchPrerequisite') {
        return;
      }
      assert.strictEqual(error.executable, 'node');
      assert.strictEqual(mockedResolveResource.mock.calls.length, 0);
    }).pipe(Effect.provide(pathServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/codex'])))),
  );
});

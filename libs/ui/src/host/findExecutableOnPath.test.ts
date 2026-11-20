import { assert, describe, it } from '@effect/vitest';
import { BundledResource, OpenUrl, OS } from '@lib/context-services';
import { PathLive } from '@lib/context-services-tauri';
import { Cause, Effect, Layer, Option, Sink, Stream } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { FetchHttpClient } from 'effect/http';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

import { makeAcpLaunchCommand } from './acpLaunchCommand.ts';
import { AntigravitySignInTimedOut, classifyBootstrapFailure } from './antigravityAuth.ts';
import type { HarnessFailure } from './harnessFailure.ts';
import { runBackendHarness } from './backendHarness.ts';
import { findExecutableOnPath, requireExecutableOnPath } from './findExecutableOnPath.ts';

const osLayer = (env: Readonly<Record<string, string>>, platform = 'linux') =>
  Layer.succeed(OS, {
    arch: () => 'arm64',
    cwd: () => '/home/operator',
    env: () => env,
    homedir: () => '/home/operator',
    platform: () => platform,
  });

const fsLayer = (existing: ReadonlySet<string>, files: Readonly<Record<string, string>> = {}) =>
  layerNoop({
    exists: path => Effect.succeed(existing.has(path) || path in files),
    makeDirectory: () => Effect.void,
    readFileString: path =>
      path in files
        ? Effect.succeed(files[path] ?? '')
        : Effect.fail(
            PlatformError.systemError({
              _tag: 'NotFound',
              description: 'No such file',
              method: 'readFileString',
              module: 'FileSystem',
              pathOrDescriptor: path,
            }),
          ),
    writeFileString: () => Effect.void,
  });

const PROVIDERS = '/home/operator/.hoa/providers';

/** `current.json` + required files for an active, completed runtime. */
const activeRuntime = (
  launchTarget: 'antigravity-acp' | 'claude-agent-acp' | 'codex-acp',
  distribution: Record<string, unknown>,
  requiredFiles: readonly string[],
): Record<string, string> => {
  const version = String(distribution.version);
  const dir = `${PROVIDERS}/${launchTarget}`;
  return {
    [`${dir}/current.json`]: JSON.stringify({
      active: { dir: `runtime/${version}`, version },
      catalog: [{ dir: `runtime/${version}`, distribution, state: { _tag: 'completed' }, version }],
      schemaVersion: 1,
    }),
    ...Object.fromEntries(requiredFiles.map(file => [`${dir}/runtime/${version}/${file}`, ''])),
  };
};

const npmRuntime = (launchTarget: 'claude-agent-acp' | 'codex-acp') =>
  activeRuntime(launchTarget, { _tag: 'npm', package: `@agentclientprotocol/${launchTarget}`, version: '1.0.0' }, [
    `node_modules/@agentclientprotocol/${launchTarget}/dist/index.js`,
  ]);

const antigravityRuntime = () =>
  activeRuntime(
    'antigravity-acp',
    {
      _tag: 'binary',
      archive: 'https://dl.google.com/agy-extensions/a.zip',
      args: ['--uid='],
      cmd: 'agy_acp_server.par',
      platform: 'linux-x86_64',
      sha256: 'a'.repeat(64),
      version: '1.4.5',
    },
    ['agy_acp_server.par', 'localharness_external'],
  );

const bundledResourceLayer = Layer.succeed(BundledResource, {
  resolve: (resourcePath: string) => Effect.succeed(`/resources/${resourcePath}`),
});

const authOkSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(command => {
    const args = command._tag === 'StandardCommand' ? command.args : [];
    const isClaude = args.includes('auth');
    const isCursor = args.includes('status') && args.includes('--format');
    const stdout = isClaude
      ? new TextEncoder().encode(JSON.stringify({ loggedIn: true }))
      : isCursor
        ? new TextEncoder().encode(JSON.stringify({ isAuthenticated: true }))
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

const pathServices = (
  env: Readonly<Record<string, string>>,
  existing: ReadonlySet<string>,
  platform = 'linux',
  files: Readonly<Record<string, string>> = {},
) => {
  const pathLayer = platform === 'win32' ? PathLive.pipe(Layer.provide(osLayer(env, platform))) : posixPathLayer;
  return Layer.mergeAll(pathLayer, fsLayer(existing, files)).pipe(Layer.provideMerge(osLayer(env, platform)));
};

const adapterServices = (
  env: Readonly<Record<string, string>>,
  existing: ReadonlySet<string>,
  authLayer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> = authOkSpawnerLayer,
  platform = 'linux',
  files: Readonly<Record<string, string>> = {},
) =>
  Layer.mergeAll(pathServices(env, existing, platform, files), authLayer, bundledResourceLayer, FetchHttpClient.layer);

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

describe('makeAcpLaunchCommand', () => {
  it.effect('builds node + entry with CODEX_PATH when prerequisites exist', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpLaunchCommand('codex-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'node');
      assert.deepStrictEqual(command.args, [
        `${PROVIDERS}/codex-acp/runtime/1.0.0/node_modules/@agentclientprotocol/codex-acp/dist/index.js`,
      ]);
      assert.strictEqual(command.options.env?.CODEX_PATH, '/usr/local/bin/codex');
    }).pipe(
      Effect.provide(
        adapterServices(
          { PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/bin/node', '/usr/local/bin/codex', '/usr/local/bin/node']),
          authOkSpawnerLayer,
          'linux',
          npmRuntime('codex-acp'),
        ),
      ),
    ),
  );

  it.effect('builds node + entry with CLAUDE_CODE_EXECUTABLE when prerequisites exist', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpLaunchCommand('claude-agent-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'node');
      assert.strictEqual(command.options.env?.CLAUDE_CODE_EXECUTABLE, '/usr/local/bin/claude');
    }).pipe(
      Effect.provide(
        adapterServices(
          { PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/local/bin/claude', '/usr/local/bin/node']),
          authOkSpawnerLayer,
          'linux',
          npmRuntime('claude-agent-acp'),
        ),
      ),
    ),
  );

  it.effect('fails with Download instructions when no runtime has been downloaded', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpLaunchCommand('claude-agent-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.include(error.message, 'Settings > Providers');
    }).pipe(
      Effect.provide(
        adapterServices({ PATH: '/usr/local/bin:/usr/bin' }, new Set(['/usr/local/bin/claude', '/usr/local/bin/node'])),
      ),
    ),
  );

  it.effect('builds agy_acp_server from the recorded command and arguments, offline', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpLaunchCommand('antigravity-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'agy_acp_server');
      assert.deepStrictEqual(command.args, ['--uid=']);
      assert.strictEqual(command.options.extendEnv, false);
      assert.strictEqual(command.options.env?.GEMINI_HOME, `${PROVIDERS}/antigravity-acp/home`);
      assert.strictEqual(command.options.env?.AGY_ACP_FORCE_FILE_STORAGE, '1');
      assert.strictEqual(command.options.env?.BROWSER, `${PROVIDERS}/antigravity-acp/browser-helper`);
      assert.strictEqual(
        command.options.env?.ANTIGRAVITY_HARNESS_PATH,
        `${PROVIDERS}/antigravity-acp/runtime/1.4.5/localharness_external`,
      );
      assert.strictEqual(command.options.stderr, 'pipe');
    }).pipe(
      Effect.provide(
        adapterServices({ PATH: '/usr/bin' }, new Set(), authOkSpawnerLayer, 'linux', antigravityRuntime()),
      ),
    ),
  );

  it.effect('fails without spawning when vendor CLI is missing', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpLaunchCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'codex');
    }).pipe(
      Effect.provide(
        adapterServices(
          { PATH: '/usr/bin' },
          new Set(['/usr/bin/node']),
          authOkSpawnerLayer,
          'linux',
          npmRuntime('codex-acp'),
        ),
      ),
    ),
  );

  it.effect('fails when node is missing', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpLaunchCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'node');
    }).pipe(Effect.provide(adapterServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/codex'])))),
  );

  it.effect('fails when vendor CLI is present but unauthenticated', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpLaunchCommand('codex-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'VendorNotAuthenticated');
      assert.strictEqual(error.executable, 'codex');
      assert.strictEqual(error.message, '`codex` is not authenticated — run `codex login`');
    }).pipe(
      Effect.provide(
        adapterServices(
          { PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/bin/node', '/usr/local/bin/codex', '/usr/local/bin/node']),
          authFailSpawnerLayer,
          'linux',
          npmRuntime('codex-acp'),
        ),
      ),
    ),
  );

  it.effect('builds cursor-agent acp when prerequisites exist', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpLaunchCommand('cursor-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'cursor-agent');
      assert.deepStrictEqual(command.args, ['acp']);
    }).pipe(
      Effect.provide(adapterServices({ PATH: '/usr/local/bin:/usr/bin' }, new Set(['/usr/local/bin/cursor-agent']))),
    ),
  );

  it.effect('builds cursor-agent --api-key … acp when CURSOR_API_KEY is set without status probe', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpLaunchCommand('cursor-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.strictEqual(command.command, 'cursor-agent');
      assert.deepStrictEqual(command.args, ['--api-key', 'test-key', 'acp']);
    }).pipe(
      Effect.provide(
        adapterServices(
          { CURSOR_API_KEY: 'test-key', PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/local/bin/cursor-agent']),
          authFailSpawnerLayer,
        ),
      ),
    ),
  );

  it.effect('builds cursor-agent --auth-token … acp when CURSOR_AUTH_TOKEN is set', () =>
    Effect.gen(function* () {
      const command = yield* makeAcpLaunchCommand('cursor-acp');
      assert.strictEqual(command._tag, 'StandardCommand');
      assert.deepStrictEqual(command.args, ['--auth-token', 'test-token', 'acp']);
    }).pipe(
      Effect.provide(
        adapterServices(
          { CURSOR_AUTH_TOKEN: 'test-token', PATH: '/usr/local/bin:/usr/bin' },
          new Set(['/usr/local/bin/cursor-agent']),
          authFailSpawnerLayer,
        ),
      ),
    ),
  );

  it.effect('fails without spawning when cursor-agent is missing', () =>
    Effect.gen(function* () {
      const error = yield* makeAcpLaunchCommand('cursor-acp').pipe(Effect.flip);
      assert.strictEqual(error._tag, 'MissingLaunchPrerequisite');
      assert.strictEqual(error.executable, 'cursor-agent');
    }).pipe(Effect.provide(adapterServices({ PATH: '/usr/bin' }, new Set(['/usr/bin/node'])))),
  );
});

describe('auth messages through bootstrap publication', () => {
  const claudeLoggedOutSpawner = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => {
      const stdout = new TextEncoder().encode(JSON.stringify({ loggedIn: false }));
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

  it.effect('publishes the normalized Claude instruction as the harness error phase', () =>
    Effect.gen(function* () {
      const phases: { readonly failure: HarnessFailure | undefined; readonly phase: string }[] = [];
      const noop = () => undefined;
      yield* runBackendHarness(
        'claude-agent-acp',
        {
          hasConfigOptionIndex: () => true,
          onConfigIndexEvent: noop,
          onConfigOptionIndexPublish: noop,
          onConnectionLost: noop,
          onElicitationCreate: noop,
          onInitializeResult: noop,
          onPermissionRequest: noop,
          onPhase: (phase, failure) => {
            phases.push({ failure, phase });
          },
          onRpcMessage: noop,
          onSessionListBegin: () => ({ complete: () => Effect.void, fail: noop, page: noop }),
          onSessionListChanges: noop,
          onSessionUpdate: noop,
        },
        () => [],
      );
      assert.deepStrictEqual(phases.at(-1), {
        failure: { _tag: 'NotSignedIn', message: '`claude` is not authenticated — run `claude` and log in' },
        phase: 'error',
      });
      // Not-signed-in is terminal: it must not fall through to the retry loop.
      assert.strictEqual(phases.filter(entry => entry.phase === 'error').length, 1);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          adapterServices(
            { PATH: '/usr/local/bin:/usr/bin' },
            new Set(['/usr/local/bin/claude', '/usr/local/bin/node']),
            claudeLoggedOutSpawner,
            'linux',
            npmRuntime('claude-agent-acp'),
          ),
          Layer.succeed(OpenUrl, { open: () => Effect.void }),
        ),
      ),
    ),
  );

  it('classifies bootstrap causes without matching the user-facing wording', () => {
    assert.deepStrictEqual(classifyBootstrapFailure('codex-acp', Cause.fail(new Error('Authentication required'))), {
      _tag: 'NotSignedIn',
      message: '`codex` is not authenticated — run `codex login`',
    });
    assert.deepStrictEqual(classifyBootstrapFailure('cursor-acp', Cause.fail(new Error('Not logged in'))), {
      _tag: 'NotSignedIn',
      message: '`cursor-agent` is not authenticated — run `cursor-agent login`',
    });
    assert.deepStrictEqual(classifyBootstrapFailure('claude-agent-acp', Cause.fail(new Error('spawn node ENOENT'))), {
      _tag: 'Failed',
      message: 'spawn node ENOENT',
    });
    // An `AcpError` arrives as a plain struct, not an `Error`: its message must be read, not JSON-stringified.
    assert.deepStrictEqual(
      classifyBootstrapFailure('codex-acp', Cause.fail({ code: -32000, message: 'Not logged in' })),
      { _tag: 'NotSignedIn', message: '`codex` is not authenticated — run `codex login`' },
    );
    // Wording never decides: only the ACP `auth_required` code or our own timeout do.
    assert.deepStrictEqual(classifyBootstrapFailure('antigravity-acp', Cause.fail(new Error('please sign in'))), {
      _tag: 'Failed',
      message: 'please sign in',
    });
    assert.deepStrictEqual(
      classifyBootstrapFailure(
        'antigravity-acp',
        Cause.fail({ code: -32603, message: 'Could not sign in to telemetry' }),
      ),
      { _tag: 'Failed', message: 'Could not sign in to telemetry' },
    );
    assert.deepStrictEqual(
      classifyBootstrapFailure('antigravity-acp', Cause.fail({ code: -32000, message: 'Session unavailable' })),
      { _tag: 'NotSignedIn', message: 'Session unavailable' },
    );
    // The sign-in timeout stays NotSignedIn (Sign in button shows) but keeps its own wording.
    assert.deepStrictEqual(
      classifyBootstrapFailure(
        'antigravity-acp',
        Cause.fail(new AntigravitySignInTimedOut({ message: 'Gave up waiting for the browser' })),
      ),
      { _tag: 'NotSignedIn', message: 'Gave up waiting for the browser' },
    );
    assert.deepStrictEqual(classifyBootstrapFailure('antigravity-acp', Cause.die('boom')), {
      _tag: 'Failed',
      message: '"boom"',
    });
  });
});

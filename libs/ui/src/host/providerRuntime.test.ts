import { assert, describe, it } from '@effect/vitest';
import {
  beginRuntimeAttempt,
  LaunchTargetSchema,
  markRuntimePendingDelete,
  readProviderRuntimeState,
  writeProviderRuntimeDocument,
} from '@lib/hoa-home';
import type { ProviderDistribution } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer, Sink, Stream } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { ChildProcessSpawner } from 'effect/process';
import * as PlatformError from 'effect/PlatformError';

import {
  activateDownloadedRuntime,
  cleanupProviderRuntimes,
  deactivateRuntime,
  downloadProviderRuntime,
  purgeAllRuntimes,
  purgeSupersededRuntimes,
  readRuntimeSnapshot,
  resolveActiveRuntime,
  resolveLatestRuntime,
} from './providerRuntime.ts';

const ROOT = '/home/operator/.hoa/providers';
const CLAUDE = `${ROOT}/claude-agent-acp`;
const ENTRY = (version: string) =>
  `${CLAUDE}/runtime/${version}/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js`;
const npm = (version: string): ProviderDistribution => ({
  _tag: 'npm',
  package: '@agentclientprotocol/claude-agent-acp',
  version,
});

type SpawnResult = { readonly exitCode: number; readonly stderr?: string; readonly stdout?: string };
type Spawned = { readonly args: readonly string[]; readonly command: string };

const spawnerLayer = (
  respond: (call: Spawned) => Effect.Effect<SpawnResult, PlatformError.PlatformError>,
  calls: Spawned[],
) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(command => {
      const standard = command as unknown as { readonly args: readonly string[]; readonly command: string };
      const call = { args: standard.args, command: standard.command };
      calls.push(call);
      return respond(call).pipe(
        Effect.map(result =>
          ChildProcessSpawner.makeHandle({
            all: Stream.empty,
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.exitCode)),
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            pid: ChildProcessSpawner.ProcessId(1),
            stderr: Stream.make(new TextEncoder().encode(result.stderr ?? '')),
            stdin: Sink.drain,
            stdout: Stream.make(new TextEncoder().encode(result.stdout ?? '')),
            unref: Effect.succeed(Effect.void),
          }),
        ),
      );
    }),
  );

const npmInstalls =
  (store: Map<string, MapFsEntry>, options: { readonly exitCode?: number; readonly writeEntry?: boolean } = {}) =>
  (call: Spawned): Effect.Effect<SpawnResult, PlatformError.PlatformError> =>
    Effect.sync(() => {
      if (call.command === 'npm' && call.args[0] === 'view') {
        return { exitCode: 0, stdout: '2.0.0\n' };
      }
      if (call.command === 'npm' && call.args[0] === 'install') {
        const prefix = call.args[2] ?? '';
        if (options.writeEntry !== false) {
          store.set(`${prefix}/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js`, {
            content: '//',
            kind: 'file',
          });
        }
        return { exitCode: options.exitCode ?? 0, stderr: (options.exitCode ?? 0) === 0 ? '' : 'npm ERR! boom' };
      }
      return { exitCode: 0 };
    });

const target = LaunchTargetSchema.make('claude-agent-acp');

const noHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make(request => Effect.succeed(HttpClientResponse.fromWeb(request, new Response('', { status: 500 })))),
);

const run = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  store: Map<string, MapFsEntry>,
  respond: ReturnType<typeof npmInstalls>,
  calls: Spawned[] = [],
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(mapFsTestServices(store), spawnerLayer(respond, calls), noHttp).pipe(
        Layer.provideMerge(Layer.empty),
      ),
    ),
  );

describe('provider runtime download (npm)', () => {
  it.effect('first download installs under runtime/<ver>, passes exact argv, and activates', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const calls: Spawned[] = [];
      const outcome = yield* run(
        downloadProviderRuntime('claude-agent-acp', npm('1.0.0')),
        store,
        npmInstalls(store),
        calls,
      );
      assert.deepStrictEqual(outcome, { activated: true, version: '1.0.0' });
      assert.deepStrictEqual(calls.at(-1), {
        args: [
          'install',
          '--prefix',
          `${CLAUDE}/runtime/1.0.0`,
          '--omit=optional',
          '--ignore-scripts',
          '@agentclientprotocol/claude-agent-acp@1.0.0',
        ],
        command: 'npm',
      });
      const state = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      assert.strictEqual(state._tag === 'Present' && state.document.active?.version, '1.0.0');
      const active = yield* run(resolveActiveRuntime('claude-agent-acp'), store, npmInstalls(store));
      assert.strictEqual(active.runtimeDir, `${CLAUDE}/runtime/1.0.0`);
    }),
  );

  it.effect('a later download is catalogued but does not replace the active runtime', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('1.0.0')), store, npmInstalls(store));
      const outcome = yield* run(downloadProviderRuntime('claude-agent-acp', npm('2.0.0')), store, npmInstalls(store));
      assert.deepStrictEqual(outcome, { activated: false, version: '2.0.0' });
      const state = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      assert.strictEqual(state._tag === 'Present' && state.document.active?.version, '1.0.0');
      assert.deepStrictEqual(
        state._tag === 'Present' && state.document.catalog.map(entry => [entry.version, entry.state._tag]),
        [
          ['1.0.0', 'completed'],
          ['2.0.0', 'completed'],
        ],
      );
    }),
  );

  it.effect('non-zero npm exit fails, removes the destination, and leaves the active runtime unchanged', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('1.0.0')), store, npmInstalls(store));
      const error = yield* run(
        downloadProviderRuntime('claude-agent-acp', npm('2.0.0')),
        store,
        npmInstalls(store, { exitCode: 1 }),
      ).pipe(Effect.flip);
      assert.include(error.message, 'exit 1');
      assert.include(error.message, 'npm ERR! boom');
      assert.isFalse([...store.keys()].some(key => key.startsWith(`${CLAUDE}/runtime/2.0.0`)));
      const state = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      assert.deepStrictEqual(state._tag === 'Present' && state.document.catalog.map(entry => entry.version), ['1.0.0']);
      assert.strictEqual(state._tag === 'Present' && state.document.active?.version, '1.0.0');
    }),
  );

  it.effect('exit 0 without the adapter entry is a failure and never becomes installable', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const error = yield* run(
        downloadProviderRuntime('claude-agent-acp', npm('1.0.0')),
        store,
        npmInstalls(store, { writeEntry: false }),
      ).pipe(Effect.flip);
      assert.include(error.message, 'missing');
      const state = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      assert.strictEqual(state._tag === 'Present' && state.document.active, null);
      assert.deepStrictEqual(state._tag === 'Present' && state.document.catalog, []);
    }),
  );

  it.effect('spawn failure is a failure', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const error = yield* downloadProviderRuntime('claude-agent-acp', npm('1.0.0')).pipe(
        Effect.provide(
          Layer.mergeAll(
            mapFsTestServices(store),
            Layer.succeed(
              ChildProcessSpawner.ChildProcessSpawner,
              ChildProcessSpawner.make(() =>
                Effect.fail(
                  PlatformError.systemError({
                    _tag: 'NotFound',
                    description: 'npm: not found',
                    method: 'spawn',
                    module: 'ChildProcess',
                  }),
                ),
              ),
            ),
            noHttp,
          ),
        ),
        Effect.flip,
      );
      assert.include(error.message, 'spawn');
      assert.isFalse([...store.keys()].some(key => key.startsWith(`${CLAUDE}/runtime/`)));
    }),
  );

  it.effect('refuses a mismatched package at the host boundary', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const calls: Spawned[] = [];
      const error = yield* run(
        downloadProviderRuntime('claude-agent-acp', { _tag: 'npm', package: 'left-pad', version: '1.0.0' }),
        store,
        npmInstalls(store),
        calls,
      ).pipe(Effect.flip);
      assert.include(error.message, 'Refusing');
      assert.strictEqual(calls.length, 0);
    }),
  );
});

describe('provider runtime resolve, cleanup and launch', () => {
  it.effect('resolveLatestRuntime returns an exact validated npm descriptor', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const calls: Spawned[] = [];
      const latest = yield* run(resolveLatestRuntime('claude-agent-acp'), store, npmInstalls(store), calls);
      assert.deepStrictEqual(latest, npm('2.0.0'));
      assert.deepStrictEqual(calls[0], {
        args: ['view', '@agentclientprotocol/claude-agent-acp@latest', 'version'],
        command: 'npm',
      });
    }),
  );

  it.effect('resolveLatestRuntime rejects non-semver output', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const error = yield* run(resolveLatestRuntime('claude-agent-acp'), store, () =>
        Effect.succeed({ exitCode: 0, stdout: 'not-a-version; rm -rf /' }),
      ).pipe(Effect.flip);
      assert.include(error.message, 'invalid version');
    }),
  );

  it.effect('startup cleanup removes interrupted attempts but keeps the active runtime', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('1.0.0')), store, npmInstalls(store));
      // An interrupted attempt: cataloged as downloading, directory half-written.
      const current = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      if (current._tag !== 'Present') {
        return yield* Effect.die('expected Present');
      }
      yield* run(
        writeProviderRuntimeDocument(
          target,
          yield* Effect.fromResult(beginRuntimeAttempt(current.document, npm('2.0.0'))),
        ),
        store,
        npmInstalls(store),
      );
      store.set(`${CLAUDE}/runtime/2.0.0/partial`, { content: 'x', kind: 'file' });

      const failures = yield* run(cleanupProviderRuntimes('claude-agent-acp'), store, npmInstalls(store));
      assert.deepStrictEqual(failures, []);
      assert.isFalse([...store.keys()].some(key => key.includes('runtime/2.0.0')));
      assert.isTrue(store.has(ENTRY('1.0.0')));
      const state = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      assert.deepStrictEqual(state._tag === 'Present' && state.document.catalog.map(entry => entry.version), ['1.0.0']);
    }),
  );

  it.effect('resolveActiveRuntime raises MissingLaunchPrerequisite with Download instructions', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const missing = yield* run(resolveActiveRuntime('claude-agent-acp'), store, npmInstalls(store)).pipe(Effect.flip);
      assert.strictEqual(missing._tag, 'MissingLaunchPrerequisite');
      assert.include(missing.message, 'Settings > Providers');

      yield* run(downloadProviderRuntime('claude-agent-acp', npm('1.0.0')), store, npmInstalls(store));
      store.delete(ENTRY('1.0.0'));
      const incomplete = yield* run(resolveActiveRuntime('claude-agent-acp'), store, npmInstalls(store)).pipe(
        Effect.flip,
      );
      assert.include(incomplete.message, 'incomplete');
    }),
  );

  it.effect('malformed current.json is an error, never treated as missing', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      store.set(`${CLAUDE}/current.json`, { content: '{oops', kind: 'file' });
      const error = yield* run(
        downloadProviderRuntime('claude-agent-acp', npm('1.0.0')),
        store,
        npmInstalls(store),
      ).pipe(Effect.flip);
      assert.include(error.message, 'Could not read provider state');
      assert.deepStrictEqual(store.get(`${CLAUDE}/current.json`), { content: '{oops', kind: 'file' });
    }),
  );
});

describe('provider runtime download (antigravity)', () => {
  const ANTI = `${ROOT}/antigravity-acp`;
  const archiveBytes = new TextEncoder().encode('zip-bytes');
  const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  const distribution = async (overrides: { readonly sha256?: string } = {}): Promise<ProviderDistribution> => ({
    _tag: 'binary',
    archive: 'https://dl.google.com/agy-extensions/releases/linux/a.zip',
    args: ['--uid='],
    cmd: 'agy_acp_server.par',
    platform: 'linux-x86_64',
    sha256: overrides.sha256 ?? (await sha256(archiveBytes)),
    version: '1.4.5',
  });
  const zipHttp = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(request => Effect.succeed(HttpClientResponse.fromWeb(request, new Response(archiveBytes)))),
  );
  const unzips =
    (store: Map<string, MapFsEntry>, members: readonly string[]) =>
    (call: Spawned): Effect.Effect<SpawnResult, PlatformError.PlatformError> =>
      Effect.sync(() => {
        if (call.command === 'unzip') {
          for (const member of members) {
            store.set(`${call.args[3]}/${member}`, { content: member, kind: 'file' });
          }
        }
        return { exitCode: 0 };
      });
  const runAnti = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    store: Map<string, MapFsEntry>,
    respond: ReturnType<typeof unzips>,
  ) => effect.pipe(Effect.provide(Layer.mergeAll(mapFsTestServices(store), spawnerLayer(respond, []), zipHttp)));

  it.effect('verifies SHA-256, extracts, requires both binaries, and records command/arguments', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const dist = yield* Effect.promise(() => distribution());
      const outcome = yield* runAnti(
        downloadProviderRuntime('antigravity-acp', dist),
        store,
        unzips(store, ['agy_acp_server.par', 'localharness_external']),
      );
      assert.deepStrictEqual(outcome, { activated: true, version: '1.4.5' });
      assert.isTrue(store.has(`${ANTI}/runtime/1.4.5/agy_acp_server.par`));
      assert.isTrue(store.has(`${ANTI}/runtime/1.4.5/localharness_external`));
      const active = yield* runAnti(resolveActiveRuntime('antigravity-acp'), store, unzips(store, []));
      assert.strictEqual(active.distribution._tag === 'binary' && active.distribution.args[0], '--uid=');
      assert.isFalse([...store.keys()].some(key => key.startsWith('/tmp/hoa-antigravity-')));
    }),
  );

  it.effect('fails a SHA-256 mismatch and a missing harness binary, leaving nothing installable', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const bad = yield* Effect.promise(() => distribution({ sha256: 'f'.repeat(64) }));
      const shaError = yield* runAnti(
        downloadProviderRuntime('antigravity-acp', bad),
        store,
        unzips(store, ['agy_acp_server.par', 'localharness_external']),
      ).pipe(Effect.flip);
      assert.include(shaError.message, 'SHA-256');

      const good = yield* Effect.promise(() => distribution());
      const missing = yield* runAnti(
        downloadProviderRuntime('antigravity-acp', good),
        store,
        unzips(store, ['agy_acp_server.par']),
      ).pipe(Effect.flip);
      assert.include(missing.message, 'localharness_external');
      assert.isFalse([...store.keys()].some(key => key.startsWith(`${ANTI}/runtime/`)));
      const state = yield* runAnti(
        readProviderRuntimeState(LaunchTargetSchema.make('antigravity-acp')),
        store,
        unzips(store, []),
      );
      assert.deepStrictEqual(state._tag === 'Present' && state.document.catalog, []);
    }),
  );
});

describe('provider runtime cleanup failure reporting', () => {
  it.effect('reports both errors, keeps a failed entry, and startup cleanup retries the deletion', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      store.set(`${CLAUDE}/runtime/1.0.0/leftover`, { content: 'x', kind: 'file' });
      const stuck = Layer.mergeAll(
        mapFsTestServices(store, { failRemoveUnder: [`${CLAUDE}/runtime/1.0.0`] }),
        spawnerLayer(npmInstalls(store, { exitCode: 1 }), []),
        noHttp,
      );
      const error = yield* downloadProviderRuntime('claude-agent-acp', npm('1.0.0')).pipe(
        Effect.provide(stuck),
        Effect.flip,
      );
      assert.include(error.message, 'Permission denied');
      assert.include(error.message, 'also failed');

      const state = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      assert.deepStrictEqual(
        state._tag === 'Present' && state.document.catalog.map(entry => [entry.version, entry.state._tag]),
        [['1.0.0', 'failed']],
      );
      assert.strictEqual(state._tag === 'Present' && state.document.active, null);

      // The directory is gone now; startup cleanup retries and drops the entry.
      const failures = yield* run(cleanupProviderRuntimes('claude-agent-acp'), store, npmInstalls(store));
      assert.deepStrictEqual(failures, []);
      const after = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      assert.deepStrictEqual(after._tag === 'Present' && after.document.catalog, []);
    }),
  );

  it.effect('re-downloading a version left in pending-delete replaces the entry instead of defecting', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('1.0.0')), store, npmInstalls(store));
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('2.0.0')), store, npmInstalls(store));
      const current = yield* run(readProviderRuntimeState(target), store, npmInstalls(store));
      if (current._tag !== 'Present') {
        return yield* Effect.die('expected Present');
      }
      yield* run(
        writeProviderRuntimeDocument(
          target,
          yield* Effect.fromResult(markRuntimePendingDelete(current.document, '2.0.0', 'EBUSY')),
        ),
        store,
        npmInstalls(store),
      );
      const outcome = yield* run(downloadProviderRuntime('claude-agent-acp', npm('2.0.0')), store, npmInstalls(store));
      assert.deepStrictEqual(outcome, { activated: false, version: '2.0.0' });
    }),
  );
});

describe('provider runtime install and remove', () => {
  const downloaded = (store: Map<string, MapFsEntry>) =>
    Effect.gen(function* () {
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('1.0.0')), store, npmInstalls(store));
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('2.0.0')), store, npmInstalls(store));
      yield* run(downloadProviderRuntime('claude-agent-acp', npm('3.0.0')), store, npmInstalls(store));
    });

  it.effect('Install activates the chosen version and deletes every superseded and never-activated directory', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      yield* downloaded(store);
      yield* run(activateDownloadedRuntime('claude-agent-acp', '3.0.0'), store, npmInstalls(store));
      const failures = yield* run(purgeSupersededRuntimes('claude-agent-acp'), store, npmInstalls(store));
      assert.deepStrictEqual(failures, []);
      assert.isTrue(store.has(ENTRY('3.0.0')));
      assert.isFalse([...store.keys()].some(key => key.includes('runtime/1.0.0') || key.includes('runtime/2.0.0')));
      const snapshot = yield* run(readRuntimeSnapshot('claude-agent-acp'), store, npmInstalls(store));
      assert.deepStrictEqual(snapshot, { active: '3.0.0', cleanupFailures: [], downloaded: [] });
    }),
  );

  it.effect('a second instance picks up the new current.json on its next resolve', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      yield* downloaded(store);
      const before = yield* run(resolveActiveRuntime('claude-agent-acp'), store, npmInstalls(store));
      assert.strictEqual(before.version, '1.0.0');
      yield* run(activateDownloadedRuntime('claude-agent-acp', '2.0.0'), store, npmInstalls(store));
      const after = yield* run(resolveActiveRuntime('claude-agent-acp'), store, npmInstalls(store));
      assert.strictEqual(after.version, '2.0.0');
    }),
  );

  it.effect('Install keeps a superseded directory that cannot be deleted in the catalog for startup retry', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      yield* downloaded(store);
      yield* run(activateDownloadedRuntime('claude-agent-acp', '3.0.0'), store, npmInstalls(store));
      const stuck = Layer.mergeAll(
        mapFsTestServices(store, { failRemoveUnder: [`${CLAUDE}/runtime/1.0.0`] }),
        spawnerLayer(npmInstalls(store), []),
        noHttp,
      );
      const failures = yield* purgeSupersededRuntimes('claude-agent-acp').pipe(Effect.provide(stuck));
      assert.deepStrictEqual(
        failures.map(failure => failure.version),
        ['1.0.0'],
      );
      const snapshot = yield* run(readRuntimeSnapshot('claude-agent-acp'), store, npmInstalls(store));
      assert.deepStrictEqual(
        snapshot.cleanupFailures.map(failure => failure.version),
        ['1.0.0'],
      );
      const retried = yield* run(cleanupProviderRuntimes('claude-agent-acp'), store, npmInstalls(store));
      assert.deepStrictEqual(retried, []);
      const after = yield* run(readRuntimeSnapshot('claude-agent-acp'), store, npmInstalls(store));
      assert.deepStrictEqual(after.cleanupFailures, []);
    }),
  );

  it.effect(
    'Remove clears the active runtime and deletes every directory; the provider then has nothing to launch',
    () =>
      Effect.gen(function* () {
        const store = new Map<string, MapFsEntry>();
        yield* downloaded(store);
        yield* run(deactivateRuntime('claude-agent-acp'), store, npmInstalls(store));
        yield* run(purgeAllRuntimes('claude-agent-acp'), store, npmInstalls(store));
        assert.isFalse([...store.keys()].some(key => key.includes('/runtime/')));
        const snapshot = yield* run(readRuntimeSnapshot('claude-agent-acp'), store, npmInstalls(store));
        assert.deepStrictEqual(snapshot, { active: undefined, cleanupFailures: [], downloaded: [] });
        const missing = yield* run(resolveActiveRuntime('claude-agent-acp'), store, npmInstalls(store)).pipe(
          Effect.flip,
        );
        assert.include(missing.message, 'Settings > Providers');
      }),
  );

  it.effect('Install cannot activate an incomplete attempt', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const error = yield* run(activateDownloadedRuntime('claude-agent-acp', '9.9.9'), store, npmInstalls(store)).pipe(
        Effect.flip,
      );
      assert.include(error.message, 'Invalid provider state transition');
    }),
  );
});

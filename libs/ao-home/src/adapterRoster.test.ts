import { assert, describe, it, layer } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Fiber, Layer, Schema } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import type { File } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { TestClock } from 'effect/testing';
import { beforeEach } from 'vitest';

import {
  adapterDirPath,
  adapterRosterLockPath,
  adapterRosterPath,
  emptyAdapterRoster,
  LaunchTargetSchema,
  readAdapterRoster,
  withAdapterRosterLock,
  writeAdapterRoster,
} from './index.ts';

const HOMEDIR = '/home/operator';
const HOME = `${HOMEDIR}/.ao`;
const LAUNCH_TARGET = Schema.decodeSync(LaunchTargetSchema)('gemini-acp');
const ADAPTER_DIR = `${HOME}/adapters/${LAUNCH_TARGET}`;
const ROSTER = `${ADAPTER_DIR}/roster.json`;
const LOCK = `${ADAPTER_DIR}/roster.lock`;

type FsEntry = { readonly content: string; readonly kind: 'file' } | { readonly kind: 'dir' };

const osLayer = Layer.succeed(OS, {
  cwd: () => HOMEDIR,
  env: () => ({}),
  homedir: () => HOMEDIR,
  platform: () => 'linux',
});

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    description: 'No such file or directory',
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

const alreadyExists = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'AlreadyExists',
    description: 'File exists',
    method,
    module: 'FileSystem',
    pathOrDescriptor: path,
  });

/** Lock tests only need open/`wx` side effects; handle methods are unused. */
const noopFile = {} as File;

const mapFsLayer = (store: Map<string, FsEntry>) =>
  layerNoop({
    exists: path => Effect.succeed(store.has(path)),
    makeDirectory: path =>
      Effect.sync(() => {
        store.set(path, { kind: 'dir' });
      }),
    open: (path, options) =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          if (options?.flag === 'wx' && store.has(path)) {
            return yield* alreadyExists('open', path);
          }
          if (options?.flag === 'wx') {
            store.set(path, { content: '', kind: 'file' });
          } else if (!store.has(path)) {
            return yield* notFound('open', path);
          }
          return noopFile;
        }),
        () => Effect.void,
      ),
    readFileString: path => {
      const entry = store.get(path);
      if (entry?.kind === 'file') {
        return Effect.succeed(entry.content);
      }
      return notFound('readFileString', path);
    },
    remove: (path, options) =>
      Effect.sync(() => {
        const present = store.has(path) || [...store.keys()].some(key => key.startsWith(`${path}/`));
        if (!present) {
          if (options?.force === true) {
            return;
          }
          throw notFound('remove', path);
        }
        for (const key of [...store.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) {
            store.delete(key);
          }
        }
      }),
    writeFileString: (path, data) =>
      Effect.sync(() => {
        store.set(path, { content: data, kind: 'file' });
      }),
  });

const services = (store: Map<string, FsEntry>) =>
  Layer.mergeAll(posixPathLayer, mapFsLayer(store)).pipe(Layer.provideMerge(osLayer));

describe('LaunchTargetSchema', () => {
  it('accepts kebab-case launch targets', () => {
    assert.strictEqual(Schema.decodeSync(LaunchTargetSchema)('gemini-acp'), 'gemini-acp');
  });

  it('rejects non-kebab launch targets', () => {
    for (const bad of ['../x', 'a/b', '', 'GeminiAcp', 'gemini_acp']) {
      assert.throws(() => Schema.decodeSync(LaunchTargetSchema)(bad));
    }
  });
});

describe('adapter roster', () => {
  const store = new Map<string, FsEntry>();

  beforeEach(() => {
    store.clear();
  });

  layer(services(store))(layeredIt => {
    layeredIt.effect('path helpers nest under adapters/launchTarget', () =>
      Effect.gen(function* () {
        const dir = yield* adapterDirPath(LAUNCH_TARGET);
        const roster = yield* adapterRosterPath(LAUNCH_TARGET);
        const lock = yield* adapterRosterLockPath(LAUNCH_TARGET);
        assert.strictEqual(dir, ADAPTER_DIR);
        assert.strictEqual(roster, ROSTER);
        assert.strictEqual(lock, LOCK);
      }),
    );

    layeredIt.effect('readAdapterRoster returns empty when missing and creates no files', () =>
      Effect.gen(function* () {
        const doc = yield* readAdapterRoster(LAUNCH_TARGET);
        assert.deepStrictEqual(doc, emptyAdapterRoster);
        assert.isFalse(store.has(ROSTER));
        assert.isFalse(store.has(ADAPTER_DIR));
        assert.isFalse(store.has(HOME));
      }),
    );

    layeredIt.effect('readAdapterRoster returns empty for corrupt JSON without rewriting', () =>
      Effect.gen(function* () {
        store.set(ADAPTER_DIR, { kind: 'dir' });
        store.set(HOME, { kind: 'dir' });
        store.set(ROSTER, { content: '{not-json', kind: 'file' });
        const doc = yield* readAdapterRoster(LAUNCH_TARGET);
        assert.deepStrictEqual(doc, emptyAdapterRoster);
        const entry = store.get(ROSTER);
        assert.isTrue(entry?.kind === 'file');
        if (entry?.kind === 'file') {
          assert.strictEqual(entry.content, '{not-json');
        }
      }),
    );

    layeredIt.effect('writeAdapterRoster then readAdapterRoster round-trips with trailing newline', () =>
      Effect.gen(function* () {
        const written = {
          sessions: [
            {
              cwd: '/work/repo',
              sessionId: 'sess-1',
              title: 'First',
              updatedAt: '2026-10-04T12:00:00.000Z',
            },
          ],
        };
        yield* writeAdapterRoster(LAUNCH_TARGET, written);
        const doc = yield* readAdapterRoster(LAUNCH_TARGET);
        assert.deepStrictEqual(doc, written);
        const onDisk = store.get(ROSTER);
        assert.isTrue(onDisk?.kind === 'file');
        if (onDisk?.kind === 'file') {
          assert.isTrue(onDisk.content.endsWith('\n'));
        }
      }),
    );

    layeredIt.effect('withAdapterRosterLock waits while lock file exists then proceeds', () =>
      Effect.gen(function* () {
        store.set(ADAPTER_DIR, { kind: 'dir' });
        store.set(HOME, { kind: 'dir' });
        store.set(LOCK, { content: '', kind: 'file' });
        const fiber = yield* withAdapterRosterLock(LAUNCH_TARGET, Effect.succeed('ok')).pipe(Effect.forkChild);

        yield* TestClock.adjust('50 millis');
        assert.isUndefined(fiber.pollUnsafe());

        store.delete(LOCK);
        yield* TestClock.adjust('50 millis');
        assert.strictEqual(yield* Fiber.join(fiber), 'ok');
        assert.isFalse(store.has(LOCK));
      }),
    );

    layeredIt.effect('withAdapterRosterLock removes lock after success and after inner failure', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* withAdapterRosterLock(LAUNCH_TARGET, Effect.succeed(42)), 42);
        assert.isFalse(store.has(LOCK));

        const exit = yield* withAdapterRosterLock(LAUNCH_TARGET, Effect.fail('boom')).pipe(Effect.exit);
        assert.isTrue(exit._tag === 'Failure');
        assert.isFalse(store.has(LOCK));
      }),
    );
  });
});

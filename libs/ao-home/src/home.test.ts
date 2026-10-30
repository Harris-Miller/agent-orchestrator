import { assert, describe, it, layer } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer, Option } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { beforeEach } from 'vitest';

import {
  defaultSettings,
  deleteSessionDir,
  ensureHome,
  normalizeAlwaysHiddenGlobs,
  readSessionUsage,
  readUserSettings,
  resolveHome,
  sessionDirPath,
  sessionUsagePath,
  settingsPath,
  writeSessionUsage,
  writeUserSettings,
} from './index.ts';

const HOMEDIR = '/home/operator';
const HOME = `${HOMEDIR}/.ao`;
const SETTINGS = `${HOME}/settings.json`;
const SESSION_ID = 'sess-1';
const SESSION_DIR = `${HOME}/sessions/${SESSION_ID}`;
const SESSION_USAGE = `${SESSION_DIR}/usage.json`;

type FsEntry = { readonly content: string; readonly kind: 'file' } | { readonly kind: 'dir' };

const osLayer = Layer.succeed(OS, {
  arch: () => 'arm64',
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

const mapFsLayer = (
  store: Map<string, FsEntry>,
  overrides: Partial<{
    readFileString: (path: string) => Effect.Effect<string, PlatformError.PlatformError>;
    writeFileString: (path: string, data: string) => Effect.Effect<void, PlatformError.PlatformError>;
  }> = {},
) =>
  layerNoop({
    exists: path => Effect.succeed(store.has(path)),
    makeDirectory: path =>
      Effect.sync(() => {
        store.set(path, { kind: 'dir' });
      }),
    readFileString:
      overrides.readFileString ??
      (path => {
        const entry = store.get(path);
        if (entry?.kind === 'file') {
          return Effect.succeed(entry.content);
        }
        return Effect.fail(notFound('readFileString', path));
      }),
    remove: (path, options) =>
      Effect.sync(() => {
        const present = store.has(path) || [...store.keys()].some(key => key.startsWith(`${path}/`));
        if (!present) {
          if (options?.force === true) {
            return;
          }
          throw notFound('remove', path);
        }
        // oxlint-disable-next-line unicorn/no-useless-spread -- Deleting during iteration requires a snapshot.
        for (const key of [...store.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) {
            store.delete(key);
          }
        }
      }),
    writeFileString:
      overrides.writeFileString ??
      ((path, data) =>
        Effect.sync(() => {
          store.set(path, { content: data, kind: 'file' });
        })),
  });

const services = (store: Map<string, FsEntry>, overrides?: Parameters<typeof mapFsLayer>[1]) =>
  Layer.mergeAll(posixPathLayer, mapFsLayer(store, overrides)).pipe(Layer.provideMerge(osLayer));

describe('ao-home', () => {
  it.effect('resolveHome joins OS.homedir with .ao', () =>
    Effect.gen(function* () {
      const home = yield* resolveHome();
      assert.strictEqual(home, HOME);
    }).pipe(Effect.provide(services(new Map()))),
  );

  it.effect('settingsPath is settings.json under home', () =>
    Effect.gen(function* () {
      const path = yield* settingsPath();
      assert.strictEqual(path, SETTINGS);
    }).pipe(Effect.provide(services(new Map()))),
  );

  it.effect('ensureHome creates the Agent Orchestrator home', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const home = yield* ensureHome().pipe(Effect.provide(services(store)));
      assert.strictEqual(home, HOME);
      assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
    }),
  );

  it('normalizeAlwaysHiddenGlobs trims, drops empties, dedupes', () => {
    assert.deepStrictEqual(normalizeAlwaysHiddenGlobs(undefined), []);
    assert.deepStrictEqual(normalizeAlwaysHiddenGlobs([' node_modules ', '', 'dist', 'node_modules']), [
      'node_modules',
      'dist',
    ]);
    assert.strictEqual(normalizeAlwaysHiddenGlobs(undefined), normalizeAlwaysHiddenGlobs([]));
  });

  it.effect('readUserSettings returns defaults when file is missing', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const doc = yield* readUserSettings().pipe(Effect.provide(services(store)));
      assert.deepStrictEqual(doc, defaultSettings);
      assert.isFalse(store.has(SETTINGS));
      assert.isFalse(store.has(HOME));
    }),
  );

  it.effect('writeUserSettings then readUserSettings round-trips known fields and unknown keys', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const testLayer = services(store);
      const writtenDoc = {
        alwaysHiddenGlobs: ['node_modules', 'dist'],
        confirmSessionDelete: false,
        experimental: true,
        theme: 'dark',
      };
      yield* writeUserSettings(writtenDoc).pipe(Effect.provide(testLayer));
      const doc = yield* readUserSettings().pipe(Effect.provide(testLayer));
      assert.deepStrictEqual(doc, writtenDoc);
      const written = store.get(SETTINGS);
      assert.isTrue(written?.kind === 'file');
      if (written?.kind === 'file') {
        assert.isTrue(written.content.endsWith('\n'));
        const parsed: unknown = JSON.parse(written.content);
        assert.isTrue(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed));
        assert.strictEqual((parsed as { theme: unknown }).theme, 'dark');
        assert.strictEqual((parsed as { confirmSessionDelete: unknown }).confirmSessionDelete, false);
        assert.deepStrictEqual((parsed as { alwaysHiddenGlobs: unknown }).alwaysHiddenGlobs, ['node_modules', 'dist']);
      }
      assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
    }),
  );

  it.effect('writeUserSettings(defaultSettings) writes product defaults and drops known and unknown keys', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const testLayer = services(store);
      yield* writeUserSettings({
        confirmSessionDelete: false,
        experimental: true,
        theme: 'dark',
      }).pipe(Effect.provide(testLayer));
      yield* writeUserSettings(defaultSettings).pipe(Effect.provide(testLayer));
      const reread = yield* readUserSettings().pipe(Effect.provide(testLayer));
      assert.deepStrictEqual(reread, defaultSettings);
    }),
  );

  it.effect('readUserSettings returns defaults for corrupt JSON without rewriting', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SETTINGS, { content: '{not-json', kind: 'file' }],
      ]);
      const doc = yield* readUserSettings().pipe(Effect.provide(services(store)));
      assert.deepStrictEqual(doc, defaultSettings);
      const entry = store.get(SETTINGS);
      assert.isTrue(entry?.kind === 'file');
      if (entry?.kind === 'file') {
        assert.strictEqual(entry.content, '{not-json');
      }
    }),
  );

  it.effect('readUserSettings returns defaults for non-object JSON without rewriting', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SETTINGS, { content: '[]\n', kind: 'file' }],
      ]);
      const doc = yield* readUserSettings().pipe(Effect.provide(services(store)));
      assert.deepStrictEqual(doc, defaultSettings);
      const entry = store.get(SETTINGS);
      assert.isTrue(entry?.kind === 'file');
      if (entry?.kind === 'file') {
        assert.strictEqual(entry.content, '[]\n');
      }
    }),
  );

  it.effect('writeUserSettings fails the Effect on I/O error', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const testLayer = services(store, {
        writeFileString: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: 'Unknown',
              description: 'disk full',
              method: 'writeFileString',
              module: 'FileSystem',
              pathOrDescriptor: SETTINGS,
            }),
          ),
      });
      const error = yield* writeUserSettings({}).pipe(Effect.provide(testLayer), Effect.flip);
      assert.strictEqual(error._tag, 'PlatformError');
      assert.isFalse(store.has(SETTINGS));
    }),
  );

  it.effect('readUserSettings fails the Effect on read I/O error', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SETTINGS, { content: '{"theme":"dark"}\n', kind: 'file' }],
      ]);
      const testLayer = services(store, {
        readFileString: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: 'PermissionDenied',
              description: 'permission denied',
              method: 'readFileString',
              module: 'FileSystem',
              pathOrDescriptor: SETTINGS,
            }),
          ),
      });
      const error = yield* readUserSettings().pipe(Effect.provide(testLayer), Effect.flip);
      assert.strictEqual(error._tag, 'PlatformError');
    }),
  );

  describe('session usage documents', () => {
    const store = new Map<string, FsEntry>();

    beforeEach(() => {
      store.clear();
    });

    layer(services(store))(layeredIt => {
      layeredIt.effect('sessionDirPath and sessionUsagePath nest under sessions/id', () =>
        Effect.gen(function* () {
          const dir = yield* sessionDirPath(SESSION_ID);
          const usage = yield* sessionUsagePath(SESSION_ID);
          assert.strictEqual(dir, SESSION_DIR);
          assert.strictEqual(usage, SESSION_USAGE);
        }),
      );

      layeredIt.effect('readSessionUsage returns none when missing', () =>
        Effect.gen(function* () {
          const doc = yield* readSessionUsage(SESSION_ID);
          assert.isTrue(Option.isNone(doc));
        }),
      );

      layeredIt.effect('writeSessionUsage then readSessionUsage round-trips', () =>
        Effect.gen(function* () {
          const usageDoc = {
            cost: { amount: 0.045, currency: 'USD' },
            size: 200_000,
            used: 53_000,
          };
          yield* writeSessionUsage(SESSION_ID, usageDoc);
          const doc = yield* readSessionUsage(SESSION_ID);
          assert.deepStrictEqual(Option.getOrThrow(doc), usageDoc);
          assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
          assert.deepStrictEqual(store.get(SESSION_DIR), { kind: 'dir' });
          const written = store.get(SESSION_USAGE);
          assert.isTrue(written?.kind === 'file');
          if (written?.kind === 'file') {
            assert.isTrue(written.content.endsWith('\n'));
          }
        }),
      );

      layeredIt.effect('writeSessionUsage accepts explicit undefined cost and omits it on disk', () =>
        Effect.gen(function* () {
          yield* writeSessionUsage(SESSION_ID, { cost: undefined, size: 258_400, used: 25_094 });
          const doc = yield* readSessionUsage(SESSION_ID);
          assert.deepStrictEqual(Option.getOrThrow(doc), { size: 258_400, used: 25_094 });
          const written = store.get(SESSION_USAGE);
          assert.isTrue(written?.kind === 'file');
          if (written?.kind === 'file') {
            const parsed: unknown = JSON.parse(written.content);
            assert.isTrue(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed));
            const record = parsed as Record<string, unknown>;
            assert.isFalse(Object.hasOwn(record, 'cost'));
            assert.strictEqual(record.size, 258_400);
            assert.strictEqual(record.used, 25_094);
          }
        }),
      );

      layeredIt.effect('readSessionUsage returns none for corrupt JSON without rewriting', () =>
        Effect.gen(function* () {
          store.set(HOME, { kind: 'dir' });
          store.set(SESSION_DIR, { kind: 'dir' });
          store.set(SESSION_USAGE, { content: '{not-json', kind: 'file' });
          const doc = yield* readSessionUsage(SESSION_ID);
          assert.isTrue(Option.isNone(doc));
          const entry = store.get(SESSION_USAGE);
          assert.isTrue(entry?.kind === 'file');
          if (entry?.kind === 'file') {
            assert.strictEqual(entry.content, '{not-json');
          }
        }),
      );

      layeredIt.effect('deleteSessionDir is a no-op when the session directory is missing', () =>
        Effect.gen(function* () {
          store.set(HOME, { kind: 'dir' });
          yield* deleteSessionDir(SESSION_ID);
          assert.isFalse(store.has(SESSION_DIR));
          assert.isFalse(store.has(SESSION_USAGE));
        }),
      );

      layeredIt.effect('deleteSessionDir removes the session directory and usage file', () =>
        Effect.gen(function* () {
          yield* writeSessionUsage(SESSION_ID, { size: 100, used: 10 });
          yield* deleteSessionDir(SESSION_ID);
          assert.isFalse(store.has(SESSION_DIR));
          assert.isFalse(store.has(SESSION_USAGE));
          assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
        }),
      );

      layeredIt.effect('writeUserSettings(defaultSettings) does not delete session usage documents', () =>
        Effect.gen(function* () {
          const usageDoc = { size: 100, used: 10 };
          yield* writeSessionUsage(SESSION_ID, usageDoc);
          yield* writeUserSettings({ theme: 'dark' });
          yield* writeUserSettings(defaultSettings);
          const usage = yield* readSessionUsage(SESSION_ID);
          assert.deepStrictEqual(Option.getOrThrow(usage), usageDoc);
        }),
      );
    });
  });
});

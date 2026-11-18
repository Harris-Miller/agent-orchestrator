import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

import {
  defaultSettings,
  ensureHome,
  normalizeAlwaysHiddenGlobs,
  readUserSettings,
  readUserSettingsStrict,
  resolveHome,
  settingsPath,
  writeUserSettings,
} from './index.ts';

const HOMEDIR = '/home/operator';
const HOME = `${HOMEDIR}/.hoa`;
const SETTINGS = `${HOME}/settings.json`;

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
        // Deleting during iteration requires a snapshot.
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

describe('hoa-home', () => {
  it.effect('resolveHome joins OS.homedir with .hoa', () =>
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

  it.effect('ensureHome creates the HOA home', () =>
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

  it.effect('readUserSettingsStrict: missing is defaults, corrupt fails and is never rewritten', () =>
    Effect.gen(function* () {
      const missing = yield* readUserSettingsStrict().pipe(Effect.provide(services(new Map<string, FsEntry>())));
      assert.deepStrictEqual(missing, defaultSettings);
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SETTINGS, { content: '{not-json', kind: 'file' }],
      ]);
      const error = yield* readUserSettingsStrict().pipe(Effect.provide(services(store)), Effect.flip);
      assert.strictEqual(error._tag, 'UserSettingsMalformed');
      assert.deepStrictEqual(store.get(SETTINGS), { content: '{not-json', kind: 'file' });
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
});

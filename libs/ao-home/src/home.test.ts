import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer, Option } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

import {
  defaultSettings,
  deleteSessionDir,
  ensureHome,
  providerConfigCatalogPath,
  readProviderConfigCatalog,
  readSessionUsage,
  readSettings,
  resolveHome,
  restoreSettingsDefaults,
  sessionDirPath,
  sessionUsagePath,
  settingsPath,
  writeProviderConfigCatalog,
  writeSessionUsage,
  writeSettings,
} from './index.ts';

const HOMEDIR = '/home/operator';
const HOME = `${HOMEDIR}/.ao`;
const SETTINGS = `${HOME}/settings.json`;
const CODEX_CATALOG = `${HOME}/harness/codex-acp/provider-config-catalog.json`;
const CODEX_HARNESS_DIR = `${HOME}/harness/codex-acp`;
const SESSION_ID = 'sess-1';
const SESSION_DIR = `${HOME}/sessions/${SESSION_ID}`;
const SESSION_USAGE = `${SESSION_DIR}/usage.json`;

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

  it.effect('readSettings returns defaults when file is missing', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const doc = yield* readSettings().pipe(Effect.provide(services(store)));
      assert.deepStrictEqual(doc, defaultSettings);
      assert.isFalse(store.has(SETTINGS));
      assert.isFalse(store.has(HOME));
    }),
  );

  it.effect('writeSettings then readSettings round-trips known fields and unknown keys', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      const writtenDoc = {
        confirmSessionDelete: false,
        experimental: true,
        harnessConfigDefaults: { 'codex-acp': { model: 'gpt-5' } },
        theme: 'dark',
      };
      yield* writeSettings(writtenDoc).pipe(Effect.provide(layer));
      const doc = yield* readSettings().pipe(Effect.provide(layer));
      assert.deepStrictEqual(doc, writtenDoc);
      const written = store.get(SETTINGS);
      assert.isTrue(written?.kind === 'file');
      if (written?.kind === 'file') {
        assert.isTrue(written.content.endsWith('\n'));
        const parsed: unknown = JSON.parse(written.content);
        assert.isTrue(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed));
        assert.strictEqual((parsed as { theme: unknown }).theme, 'dark');
        assert.strictEqual((parsed as { confirmSessionDelete: unknown }).confirmSessionDelete, false);
      }
      assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
    }),
  );

  it.effect('restoreSettingsDefaults writes product defaults and drops known and unknown keys', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      yield* writeSettings({
        confirmSessionDelete: false,
        experimental: true,
        harnessConfigDefaults: { 'codex-acp': { model: 'gpt-5' } },
        theme: 'dark',
      }).pipe(Effect.provide(layer));
      const doc = yield* restoreSettingsDefaults().pipe(Effect.provide(layer));
      assert.deepStrictEqual(doc, defaultSettings);
      const reread = yield* readSettings().pipe(Effect.provide(layer));
      assert.deepStrictEqual(reread, defaultSettings);
    }),
  );

  it.effect('readSettings returns defaults for corrupt JSON without rewriting', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SETTINGS, { content: '{not-json', kind: 'file' }],
      ]);
      const doc = yield* readSettings().pipe(Effect.provide(services(store)));
      assert.deepStrictEqual(doc, defaultSettings);
      const entry = store.get(SETTINGS);
      assert.isTrue(entry?.kind === 'file');
      if (entry?.kind === 'file') {
        assert.strictEqual(entry.content, '{not-json');
      }
    }),
  );

  it.effect('readSettings returns defaults for non-object JSON without rewriting', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SETTINGS, { content: '[]\n', kind: 'file' }],
      ]);
      const doc = yield* readSettings().pipe(Effect.provide(services(store)));
      assert.deepStrictEqual(doc, defaultSettings);
      const entry = store.get(SETTINGS);
      assert.isTrue(entry?.kind === 'file');
      if (entry?.kind === 'file') {
        assert.strictEqual(entry.content, '[]\n');
      }
    }),
  );

  it.effect('writeSettings fails the Effect on I/O error', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store, {
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
      const error = yield* writeSettings({}).pipe(Effect.provide(layer), Effect.flip);
      assert.strictEqual(error._tag, 'PlatformError');
      assert.isFalse(store.has(SETTINGS));
    }),
  );

  it.effect('readSettings fails the Effect on read I/O error', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SETTINGS, { content: '{"theme":"dark"}\n', kind: 'file' }],
      ]);
      const layer = services(store, {
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
      const error = yield* readSettings().pipe(Effect.provide(layer), Effect.flip);
      assert.strictEqual(error._tag, 'PlatformError');
    }),
  );

  it.effect('providerConfigCatalogPath nests under harness/launchTarget', () =>
    Effect.gen(function* () {
      const path = yield* providerConfigCatalogPath('codex-acp');
      assert.strictEqual(path, CODEX_CATALOG);
    }).pipe(Effect.provide(services(new Map()))),
  );

  it.effect('readProviderConfigCatalog returns none when missing', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const doc = yield* readProviderConfigCatalog('codex-acp').pipe(Effect.provide(services(store)));
      assert.isTrue(Option.isNone(doc));
    }),
  );

  it.effect('writeProviderConfigCatalog then readProviderConfigCatalog round-trips', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      const catalogDoc = {
        catalog: [
          {
            category: 'models',
            choices: [{ id: 'a', name: 'A' }],
            id: 'model',
            name: 'Model',
          },
        ],
      };
      yield* writeProviderConfigCatalog('codex-acp', catalogDoc).pipe(Effect.provide(layer));
      const doc = yield* readProviderConfigCatalog('codex-acp').pipe(Effect.provide(layer));
      assert.deepStrictEqual(Option.getOrThrow(doc), catalogDoc);
      assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
      assert.deepStrictEqual(store.get(CODEX_HARNESS_DIR), { kind: 'dir' });
      const written = store.get(CODEX_CATALOG);
      assert.isTrue(written?.kind === 'file');
      if (written?.kind === 'file') {
        assert.isTrue(written.content.endsWith('\n'));
      }
    }),
  );

  it.effect('readProviderConfigCatalog returns none for corrupt JSON without rewriting', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [CODEX_CATALOG, { content: '{not-json', kind: 'file' }],
        [CODEX_HARNESS_DIR, { kind: 'dir' }],
        [HOME, { kind: 'dir' }],
      ]);
      const doc = yield* readProviderConfigCatalog('codex-acp').pipe(Effect.provide(services(store)));
      assert.isTrue(Option.isNone(doc));
      const entry = store.get(CODEX_CATALOG);
      assert.isTrue(entry?.kind === 'file');
      if (entry?.kind === 'file') {
        assert.strictEqual(entry.content, '{not-json');
      }
    }),
  );

  it.effect('restoreSettingsDefaults does not delete provider config catalog documents', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      const catalogDoc = {
        catalog: [{ choices: [{ id: 'a', name: 'A' }], id: 'model', name: 'Model' }],
      };
      yield* writeProviderConfigCatalog('codex-acp', catalogDoc).pipe(Effect.provide(layer));
      yield* writeSettings({ theme: 'dark' }).pipe(Effect.provide(layer));
      yield* restoreSettingsDefaults().pipe(Effect.provide(layer));
      const catalog = yield* readProviderConfigCatalog('codex-acp').pipe(Effect.provide(layer));
      assert.deepStrictEqual(Option.getOrThrow(catalog), catalogDoc);
      const settings = yield* readSettings().pipe(Effect.provide(layer));
      assert.deepStrictEqual(settings, defaultSettings);
    }),
  );

  it.effect('sessionDirPath and sessionUsagePath nest under sessions/id', () =>
    Effect.gen(function* () {
      const dir = yield* sessionDirPath(SESSION_ID);
      const usage = yield* sessionUsagePath(SESSION_ID);
      assert.strictEqual(dir, SESSION_DIR);
      assert.strictEqual(usage, SESSION_USAGE);
    }).pipe(Effect.provide(services(new Map()))),
  );

  it.effect('readSessionUsage returns none when missing', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const doc = yield* readSessionUsage(SESSION_ID).pipe(Effect.provide(services(store)));
      assert.isTrue(Option.isNone(doc));
    }),
  );

  it.effect('writeSessionUsage then readSessionUsage round-trips', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      const usageDoc = {
        cost: { amount: 0.045, currency: 'USD' },
        size: 200_000,
        used: 53_000,
      };
      yield* writeSessionUsage(SESSION_ID, usageDoc).pipe(Effect.provide(layer));
      const doc = yield* readSessionUsage(SESSION_ID).pipe(Effect.provide(layer));
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

  it.effect('writeSessionUsage accepts explicit undefined cost and omits it on disk', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      yield* writeSessionUsage(SESSION_ID, { cost: undefined, size: 258_400, used: 25_094 }).pipe(
        Effect.provide(layer),
      );
      const doc = yield* readSessionUsage(SESSION_ID).pipe(Effect.provide(layer));
      assert.deepStrictEqual(Option.getOrThrow(doc), { size: 258_400, used: 25_094 });
      const written = store.get(SESSION_USAGE);
      assert.isTrue(written?.kind === 'file');
      if (written?.kind === 'file') {
        const parsed: unknown = JSON.parse(written.content);
        assert.isTrue(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed));
        assert.isFalse(Object.hasOwn(parsed, 'cost'));
        assert.strictEqual((parsed as { size: unknown }).size, 258_400);
        assert.strictEqual((parsed as { used: unknown }).used, 25_094);
      }
    }),
  );

  it.effect('readSessionUsage returns none for corrupt JSON without rewriting', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([
        [HOME, { kind: 'dir' }],
        [SESSION_DIR, { kind: 'dir' }],
        [SESSION_USAGE, { content: '{not-json', kind: 'file' }],
      ]);
      const doc = yield* readSessionUsage(SESSION_ID).pipe(Effect.provide(services(store)));
      assert.isTrue(Option.isNone(doc));
      const entry = store.get(SESSION_USAGE);
      assert.isTrue(entry?.kind === 'file');
      if (entry?.kind === 'file') {
        assert.strictEqual(entry.content, '{not-json');
      }
    }),
  );

  it.effect('deleteSessionDir is a no-op when the session directory is missing', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([[HOME, { kind: 'dir' }]]);
      yield* deleteSessionDir(SESSION_ID).pipe(Effect.provide(services(store)));
      assert.isFalse(store.has(SESSION_DIR));
      assert.isFalse(store.has(SESSION_USAGE));
    }),
  );

  it.effect('deleteSessionDir removes the session directory and usage file', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      yield* writeSessionUsage(SESSION_ID, { size: 100, used: 10 }).pipe(Effect.provide(layer));
      yield* deleteSessionDir(SESSION_ID).pipe(Effect.provide(layer));
      assert.isFalse(store.has(SESSION_DIR));
      assert.isFalse(store.has(SESSION_USAGE));
      assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
    }),
  );

  it.effect('restoreSettingsDefaults does not delete session usage documents', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      const usageDoc = { size: 100, used: 10 };
      yield* writeSessionUsage(SESSION_ID, usageDoc).pipe(Effect.provide(layer));
      yield* writeSettings({ theme: 'dark' }).pipe(Effect.provide(layer));
      yield* restoreSettingsDefaults().pipe(Effect.provide(layer));
      const usage = yield* readSessionUsage(SESSION_ID).pipe(Effect.provide(layer));
      assert.deepStrictEqual(Option.getOrThrow(usage), usageDoc);
    }),
  );
});

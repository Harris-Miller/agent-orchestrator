import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

import { defaultSettings, ensureHome, readSettings, resolveHome, settingsPath, writeSettings } from './index.ts';

const HOMEDIR = '/home/operator';
const HOME = `${HOMEDIR}/.ao`;
const SETTINGS = `${HOME}/settings.json`;

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

  it.effect('writeSettings then readSettings round-trips including unknown keys', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const layer = services(store);
      yield* writeSettings({ experimental: true, theme: 'dark' }).pipe(Effect.provide(layer));
      const doc = yield* readSettings().pipe(Effect.provide(layer));
      assert.deepStrictEqual(doc, { experimental: true, theme: 'dark' });
      const written = store.get(SETTINGS);
      assert.isTrue(written?.kind === 'file');
      if (written?.kind === 'file') {
        assert.isTrue(written.content.endsWith('\n'));
        const parsed: unknown = JSON.parse(written.content);
        assert.isTrue(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed));
        assert.strictEqual((parsed as { theme: unknown }).theme, 'dark');
      }
      assert.deepStrictEqual(store.get(HOME), { kind: 'dir' });
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
});

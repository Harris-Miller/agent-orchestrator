import { assert, describe, it } from '@effect/vitest';
import { defaultSettings, readUserSettings } from '@lib/hoa-home';
import type { UserSettings } from '@lib/hoa-home';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import * as PlatformError from 'effect/PlatformError';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';

import { createHostRuntime } from '../../createHostRuntime.ts';
import { showArchivedAtom } from '../backendState.atoms.ts';
import { mockHostLayer } from '../mockHostLayer.testing.ts';

import { createUserSettingsAtoms, unwrapUserSettings } from './userSettings.atoms.ts';

const HOMEDIR = '/home/operator';
const HOME = `${HOMEDIR}/.hoa`;
const SETTINGS = `${HOME}/settings.json`;

type FsEntry = { readonly content: string; readonly kind: 'file' } | { readonly kind: 'dir' };

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

const hostLayer = (store: Map<string, FsEntry>, overrides?: Parameters<typeof mapFsLayer>[1]) =>
  Layer.merge(mockHostLayer, mapFsLayer(store, overrides));

const awaitSettled = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
): Effect.Effect<AsyncResult.AsyncResult<A, E>> =>
  Effect.callback(resume => {
    const handle = { unsub: undefined as (() => void) | undefined };
    handle.unsub = registry.subscribe(
      atom,
      result => {
        if ((AsyncResult.isSuccess(result) || AsyncResult.isFailure(result)) && !result.waiting) {
          handle.unsub?.();
          resume(Effect.succeed(result));
        }
      },
      { immediate: true },
    );
  });

describe('showArchivedSettingAtom', () => {
  it.effect('toggling patches User settings, and Show archived follows the document', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(hostLayer(store));
      const { showArchivedSettingAtom, userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);

      assert.isFalse(registry.get(showArchivedSettingAtom));
      registry.set(showArchivedSettingAtom, true);
      assert.isTrue(registry.get(showArchivedAtom));
      assert.isTrue(registry.get(showArchivedSettingAtom));
      assert.isTrue(unwrapUserSettings(registry.get(userSettingsAtom)).showArchived);
      registry.dispose();
    }),
  );

  it.effect('follows any User settings change: a whole-document write and a re-read of settings.json', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(hostLayer(store));
      const { userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);

      registry.set(userSettingsAtom, { showArchived: true });
      assert.isTrue(registry.get(showArchivedAtom));

      store.set(SETTINGS, { content: '{"showArchived":false}', kind: 'file' });
      registry.refresh(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);
      assert.isFalse(registry.get(showArchivedAtom));
      registry.dispose();
    }),
  );
});

describe('userSettingsAtom', () => {
  it.effect('subscribe loads Initial then Success defaults when settings file missing', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(hostLayer(store));
      const { userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);

      const result = yield* awaitSettled(registry, userSettingsAtom);
      assert.ok(AsyncResult.isSuccess(result));
      assert.deepStrictEqual(result.value, defaultSettings);
      registry.dispose();
    }),
  );

  it.effect('set updates memory Success, persists, and read-back matches', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(hostLayer(store));
      const { persistUserSettingsAtomFn, userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);

      const next: UserSettings = { confirmSessionDelete: false, theme: 'dark' };
      registry.set(userSettingsAtom, next);
      const memory = registry.get(userSettingsAtom);
      assert.ok(AsyncResult.isSuccess(memory));
      assert.deepStrictEqual(memory.value, next);

      registry.mount(persistUserSettingsAtomFn);
      const persisted = yield* awaitSettled(registry, persistUserSettingsAtomFn);
      assert.ok(AsyncResult.isSuccess(persisted));

      const disk = yield* readUserSettings().pipe(Effect.provide(hostLayer(store)));
      assert.deepStrictEqual(disk, next);
      registry.dispose();
    }),
  );

  it.effect('restore via set(defaultSettings) clears prefs on disk', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(hostLayer(store));
      const { persistUserSettingsAtomFn, userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);

      registry.set(userSettingsAtom, { theme: 'dark' });
      registry.mount(persistUserSettingsAtomFn);
      yield* awaitSettled(registry, persistUserSettingsAtomFn);

      registry.set(userSettingsAtom, defaultSettings);
      yield* awaitSettled(registry, persistUserSettingsAtomFn);

      const disk = yield* readUserSettings().pipe(Effect.provide(hostLayer(store)));
      assert.deepStrictEqual(disk, defaultSettings);
      assert.deepStrictEqual(AsyncResult.getOrThrow(registry.get(userSettingsAtom)), defaultSettings);
      registry.dispose();
    }),
  );

  it.effect('load Failure is honest; doc helper still yields editable base', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>([[SETTINGS, { content: '{"theme":"dark"}', kind: 'file' }]]);
      const { atomRuntime } = createHostRuntime(
        hostLayer(store, {
          readFileString: path =>
            path === SETTINGS
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: 'PermissionDenied',
                    description: 'denied',
                    method: 'readFileString',
                    module: 'FileSystem',
                    pathOrDescriptor: path,
                  }),
                )
              : Effect.fail(notFound('readFileString', path)),
        }),
      );
      const { userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);

      const result = yield* awaitSettled(registry, userSettingsAtom);
      assert.ok(AsyncResult.isFailure(result));
      assert.deepStrictEqual(unwrapUserSettings(result), defaultSettings);
      registry.dispose();
    }),
  );

  it.effect('write Failure leaves persist fn Failure and memory Success(next)', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(
        hostLayer(store, {
          writeFileString: () =>
            Effect.fail(
              PlatformError.systemError({
                _tag: 'PermissionDenied',
                description: 'denied',
                method: 'writeFileString',
                module: 'FileSystem',
                pathOrDescriptor: SETTINGS,
              }),
            ),
        }),
      );
      const { persistUserSettingsAtomFn, userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);

      const next: UserSettings = { theme: 'dark' };
      registry.set(userSettingsAtom, next);
      assert.ok(AsyncResult.isSuccess(registry.get(userSettingsAtom)));
      assert.deepStrictEqual(AsyncResult.getOrThrow(registry.get(userSettingsAtom)), next);

      registry.mount(persistUserSettingsAtomFn);
      const persisted = yield* awaitSettled(registry, persistUserSettingsAtomFn);
      assert.ok(AsyncResult.isFailure(persisted));
      assert.ok(AsyncResult.isSuccess(registry.get(userSettingsAtom)));
      assert.deepStrictEqual(AsyncResult.getOrThrow(registry.get(userSettingsAtom)), next);
      registry.dispose();
    }),
  );

  it.effect('post-write settings Success reflects next value', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(hostLayer(store));
      const { persistUserSettingsAtomFn, userSettingsAtom } = createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);

      const next: UserSettings = {
        theme: 'dark',
      };
      registry.set(userSettingsAtom, next);
      registry.mount(persistUserSettingsAtomFn);
      yield* awaitSettled(registry, persistUserSettingsAtomFn);

      const settings = AsyncResult.getOrThrow(registry.get(userSettingsAtom));
      assert.strictEqual(settings.theme, 'dark');
      registry.dispose();
    }),
  );

  it.effect('alwaysHiddenGlobsAtom round-trips normalized globs; unset reads as []', () =>
    Effect.gen(function* () {
      const store = new Map<string, FsEntry>();
      const { atomRuntime } = createHostRuntime(hostLayer(store));
      const { alwaysHiddenGlobsAtom, persistUserSettingsAtomFn, userSettingsAtom } =
        createUserSettingsAtoms(atomRuntime);
      const registry = AtomRegistry.make();
      registry.mount(userSettingsAtom);
      yield* awaitSettled(registry, userSettingsAtom);

      assert.deepStrictEqual(registry.get(alwaysHiddenGlobsAtom), []);

      registry.set(alwaysHiddenGlobsAtom, [' node_modules ', '', 'dist', 'node_modules']);
      assert.deepStrictEqual(registry.get(alwaysHiddenGlobsAtom), ['node_modules', 'dist']);

      registry.mount(persistUserSettingsAtomFn);
      yield* awaitSettled(registry, persistUserSettingsAtomFn);
      const disk = yield* readUserSettings().pipe(Effect.provide(hostLayer(store)));
      assert.deepStrictEqual(disk.alwaysHiddenGlobs, ['node_modules', 'dist']);

      registry.set(alwaysHiddenGlobsAtom, ['  ', '']);
      assert.deepStrictEqual(registry.get(alwaysHiddenGlobsAtom), []);
      yield* awaitSettled(registry, persistUserSettingsAtomFn);
      const cleared = yield* readUserSettings().pipe(Effect.provide(hostLayer(store)));
      assert.strictEqual(cleared.alwaysHiddenGlobs, undefined);
      registry.dispose();
    }),
  );
});

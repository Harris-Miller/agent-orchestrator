import { assert, describe, it } from '@effect/vitest';
import { mapFsTestServices } from '@lib/ao-home/testing';
import type { MapFsEntry } from '@lib/ao-home/testing';
import { Effect, Layer } from 'effect';

import { seedProviderEnabledIfAbsent } from './providerBootstrap.ts';
import { OS } from '@lib/context-services';

const SETTINGS = '/home/operator/.ao/settings.json';

const services = (store: Map<string, MapFsEntry>, path: string) =>
  Layer.mergeAll(
    mapFsTestServices(store),
    Layer.succeed(OS, {
      arch: () => 'arm64',
      cwd: () => '/home/operator',
      env: () => ({ PATH: path }),
      homedir: () => '/home/operator',
      platform: () => 'linux',
    }),
  );

describe('seedProviderEnabledIfAbsent', () => {
  it.effect('enables Claude/Codex only when on PATH, keeps unrelated keys, and never reseeds', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>([
        ['/usr/bin/claude', { content: '', kind: 'file' }],
        [SETTINGS, { content: JSON.stringify({ theme: 'dark', custom: 1 }), kind: 'file' }],
      ]);
      const first = yield* seedProviderEnabledIfAbsent().pipe(Effect.provide(services(store, '/usr/bin')));
      assert.isTrue(first.seeded);
      assert.deepStrictEqual(first.settings.providerEnabled, {
        'antigravity-acp': false,
        'claude-agent-acp': true,
        'codex-acp': false,
        'cursor-acp': false,
      });
      const onDisk = JSON.parse((store.get(SETTINGS) as { content: string }).content) as Record<string, unknown>;
      assert.strictEqual(onDisk.theme, 'dark');
      assert.strictEqual(onDisk.custom, 1);

      // The user switches Codex on later; a new CLI appearing must not change anything.
      store.set('/usr/bin/codex', { content: '', kind: 'file' });
      const second = yield* seedProviderEnabledIfAbsent().pipe(Effect.provide(services(store, '/usr/bin')));
      assert.isFalse(second.seeded);
      assert.strictEqual(second.settings.providerEnabled?.['codex-acp'], false);
    }),
  );

  it.effect('malformed settings fail without seeding or overwriting', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>([[SETTINGS, { content: '{oops', kind: 'file' }]]);
      const error = yield* seedProviderEnabledIfAbsent().pipe(Effect.provide(services(store, '/usr/bin')), Effect.flip);
      assert.strictEqual(error._tag, 'UserSettingsMalformed');
      assert.deepStrictEqual(store.get(SETTINGS), { content: '{oops', kind: 'file' });
    }),
  );

  it.effect('missing settings file seeds from defaults', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const result = yield* seedProviderEnabledIfAbsent().pipe(Effect.provide(services(store, '/usr/bin')));
      assert.isTrue(result.seeded);
      assert.isTrue(store.has(SETTINGS));
    }),
  );
});

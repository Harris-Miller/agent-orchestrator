import { assert, describe, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { beforeEach } from 'vitest';

import { readTrackedCwds, trackCwds, trackedCwdsPath, untrackCwd } from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.hoa/tracked-cwds.json';

describe('tracked cwds', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('reads empty when missing, tracks idempotently in order, untracks', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* trackedCwdsPath(), file);
        assert.deepStrictEqual(yield* readTrackedCwds(), { cwds: [] });
        yield* trackCwds(['/a', '/b']);
        yield* trackCwds(['/b', '/c', '/c']);
        assert.deepStrictEqual(yield* readTrackedCwds(), { cwds: ['/a', '/b', '/c'] });
        yield* untrackCwd('/b');
        assert.deepStrictEqual((yield* readTrackedCwds()).cwds, ['/a', '/c']);
      }),
    );

    testIt.effect('re-reads the file so an external cwd survives a later change', () =>
      Effect.gen(function* () {
        yield* trackCwds(['/a']);
        store.set(file, { kind: 'file', content: JSON.stringify({ cwds: ['/a', '/external'] }) });
        yield* trackCwds(['/b']);
        assert.deepStrictEqual((yield* readTrackedCwds()).cwds, ['/a', '/external', '/b']);
      }),
    );

    testIt.effect('never overwrites a malformed file', () =>
      Effect.gen(function* () {
        store.set(file, { kind: 'file', content: '{bad' });
        const exit = yield* Effect.exit(trackCwds(['/a']));
        assert.isTrue(Exit.isFailure(exit));
        assert.deepStrictEqual(store.get(file), { kind: 'file', content: '{bad' });
        assert.isTrue(Exit.isFailure(yield* Effect.exit(readTrackedCwds())));
      }),
    );
  });
});

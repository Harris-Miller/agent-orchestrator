import { assert, describe, layer } from '@effect/vitest';
import { Effect, Exit, Schema } from 'effect';
import { beforeEach } from 'vitest';

import { LaunchTargetSchema, pinnedSessionsPath, pinSession, readPinnedSessions, unpinSessions } from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const target = Schema.decodeSync(LaunchTargetSchema)('codex-acp');
const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.hoa/harness/codex-acp/pinned-sessions.json';

describe('pinned sessions', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('reads empty when missing, pins idempotently, unpins', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* pinnedSessionsPath(target), file);
        assert.deepStrictEqual(yield* readPinnedSessions(target), { pinned: [] });
        yield* pinSession(target, { cwd: '/a', sessionId: 's1' });
        yield* pinSession(target, { cwd: '/a', sessionId: 's1' });
        yield* pinSession(target, { cwd: '/b', sessionId: 's2' });
        assert.deepStrictEqual(yield* readPinnedSessions(target), {
          pinned: [
            { cwd: '/a', sessionId: 's1' },
            { cwd: '/b', sessionId: 's2' },
          ],
        });
        yield* unpinSessions(target, ['s1']);
        assert.deepStrictEqual((yield* readPinnedSessions(target)).pinned, [{ cwd: '/b', sessionId: 's2' }]);
      }),
    );

    testIt.effect('re-reads the file so an external pin survives a later change', () =>
      Effect.gen(function* () {
        yield* pinSession(target, { cwd: '/a', sessionId: 's1' });
        store.set(file, {
          kind: 'file',
          content: JSON.stringify({
            pinned: [
              { cwd: '/a', sessionId: 's1' },
              { cwd: '/x', sessionId: 'external' },
            ],
          }),
        });
        yield* pinSession(target, { cwd: '/b', sessionId: 's2' });
        assert.deepStrictEqual(
          (yield* readPinnedSessions(target)).pinned.map(item => item.sessionId),
          ['s1', 'external', 's2'],
        );
      }),
    );

    testIt.effect('never overwrites a malformed file', () =>
      Effect.gen(function* () {
        store.set('/home/operator/.hoa/harness/codex-acp', { kind: 'dir' });
        store.set(file, { kind: 'file', content: '{bad' });
        const exit = yield* Effect.exit(pinSession(target, { cwd: '/a', sessionId: 's1' }));
        assert.isTrue(Exit.isFailure(exit));
        assert.deepStrictEqual(store.get(file), { kind: 'file', content: '{bad' });
      }),
    );
  });
});

import { assert, describe, layer } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { beforeEach } from 'vitest';

import {
  capSessionIndexRows,
  LaunchTargetSchema,
  providerDir,
  readSessionIndex,
  removeSessionIndexCwds,
  SESSION_INDEX_ROWS_PER_CWD,
  sessionIndexPath,
  sessionIndexRows,
  updateSessionIndex,
} from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const target = Schema.decodeSync(LaunchTargetSchema)('codex-acp');
const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.hoa/providers/codex-acp/session-index.json';

describe('session index', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('lives in the provider directory and reads empty when missing or corrupt', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* providerDir(target), '/home/operator/.hoa/providers/codex-acp');
        assert.strictEqual(yield* sessionIndexPath(target), file);
        assert.deepStrictEqual(yield* readSessionIndex(target), { cwds: {} });
        store.set('/home/operator/.hoa/providers/codex-acp', { kind: 'dir' });
        store.set(file, { kind: 'file', content: '{bad' });
        assert.deepStrictEqual(yield* readSessionIndex(target), { cwds: {} });
      }),
    );

    testIt.effect('round-trips complete list rows, including updatedAt and _meta, grouped by cwd', () =>
      Effect.gen(function* () {
        const row = {
          _meta: { provider: { archived: false } },
          cwd: '/work',
          sessionId: 's1',
          title: 'Work',
          updatedAt: '2026-10-30T12:00:00.000Z',
        };
        yield* updateSessionIndex(target, { '/work': [row] }, new Set());
        assert.deepStrictEqual(yield* readSessionIndex(target), { cwds: { '/work': [row] } });
        const written = store.get(file);
        assert.isTrue(written?.kind === 'file');
        if (written?.kind === 'file') {
          assert.isTrue(written.content.endsWith('\n'));
          assert.include(written.content, '"_meta"');
          assert.notInclude(written.content, 'unavailable');
        }
      }),
    );

    testIt.effect('keeps the newest rows per cwd plus pinned rows of that cwd', () =>
      Effect.sync(() => {
        const rows = Array.from({ length: SESSION_INDEX_ROWS_PER_CWD + 3 }, (_, index) => ({
          cwd: '/work',
          sessionId: `s${String(index).padStart(2, '0')}`,
          updatedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        }));
        const capped = capSessionIndexRows(rows, new Set(['s00']));
        assert.strictEqual(capped.length, SESSION_INDEX_ROWS_PER_CWD + 1);
        assert.strictEqual(capped[0]?.sessionId, 's12');
        assert.isTrue(capped.some(row => row.sessionId === 's00'));
        assert.isFalse(capped.some(row => row.sessionId === 's01'));
      }),
    );

    testIt.effect('rewrites only the listed cwds and preserves the others (merge-on-write)', () =>
      Effect.gen(function* () {
        const a = { cwd: '/a', sessionId: 'a1' };
        const b = { cwd: '/b', sessionId: 'b1' };
        yield* updateSessionIndex(target, { '/a': [a], '/b': [b] }, new Set());
        yield* updateSessionIndex(target, { '/a': [{ cwd: '/a', sessionId: 'a2' }] }, new Set());
        const document = yield* readSessionIndex(target);
        assert.sameMembers(
          sessionIndexRows(document).map(row => row.sessionId),
          ['a2', 'b1'],
        );
        assert.deepStrictEqual(
          sessionIndexRows(document, new Set(['/b'])).map(row => row.sessionId),
          ['b1'],
        );
        yield* updateSessionIndex(target, { '/a': [] }, new Set());
        assert.deepStrictEqual(Object.keys((yield* readSessionIndex(target)).cwds), ['/b']);
      }),
    );

    testIt.effect('removes the entries of the given cwds only', () =>
      Effect.gen(function* () {
        yield* updateSessionIndex(
          target,
          { '/a': [{ cwd: '/a', sessionId: 'a1' }], '/b': [{ cwd: '/b', sessionId: 'b1' }] },
          new Set(),
        );
        yield* removeSessionIndexCwds(target, ['/a']);
        assert.deepStrictEqual(Object.keys((yield* readSessionIndex(target)).cwds), ['/b']);
      }),
    );
  });
});

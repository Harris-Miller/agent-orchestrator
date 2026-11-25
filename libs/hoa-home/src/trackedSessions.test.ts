import { assert, describe, layer } from '@effect/vitest';
import { Effect, Exit, Schema } from 'effect';
import { beforeEach } from 'vitest';

import {
  LaunchTargetSchema,
  readTrackedSessions,
  removeTrackedSession,
  trackedSessionRows,
  TrackedSessionsMalformed,
  trackedSessionsPath,
  upsertTrackedSessions,
} from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const target = Schema.decodeSync(LaunchTargetSchema)('codex-acp');
const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.hoa/providers/codex-acp/tracked-sessions.json';

describe('tracked sessions', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('reads empty when missing and round-trips records with _meta, grouped by cwd', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* trackedSessionsPath(target), file);
        assert.deepStrictEqual(yield* readTrackedSessions(target), { cwds: {} });
        const row = {
          _meta: { jetbrains: { air: { archived: true } } },
          cwd: '/work',
          sessionId: 's1',
          title: 'Work',
          updatedAt: '2026-10-30T12:00:00.000Z',
        };
        yield* upsertTrackedSessions(target, [row]);
        assert.deepStrictEqual(yield* readTrackedSessions(target), { cwds: { '/work': [row] } });
      }),
    );

    testIt.effect('round-trips Additional directories and a workspace file; a record without them still decodes', () =>
      Effect.gen(function* () {
        const withDirectories = {
          additionalDirectories: ['/lib/a', '/lib/b'],
          cwd: '/work',
          sessionId: 's1',
          workspaceFile: '/work/app.code-workspace',
        };
        const plain = { cwd: '/work', sessionId: 's2', title: 'Old' };
        yield* upsertTrackedSessions(target, [withDirectories, plain]);
        const read = yield* readTrackedSessions(target);
        assert.deepStrictEqual(read, { cwds: { '/work': [withDirectories, plain] } });
        assert.strictEqual('additionalDirectories' in read.cwds['/work'][1], false);
      }),
    );

    testIt.effect('upserts per record, preserving siblings and external writes', () =>
      Effect.gen(function* () {
        yield* upsertTrackedSessions(target, [
          { cwd: '/a', sessionId: 's1', title: 'one' },
          { cwd: '/a', sessionId: 's2', title: 'two' },
        ]);
        store.set(file, {
          kind: 'file',
          content: JSON.stringify({
            cwds: {
              '/a': [
                { cwd: '/a', sessionId: 's1', title: 'one' },
                { cwd: '/a', sessionId: 's2', title: 'two' },
              ],
              '/x': [{ cwd: '/x', sessionId: 'external' }],
            },
          }),
        });
        yield* upsertTrackedSessions(target, [{ cwd: '/a', sessionId: 's1', title: 'renamed' }]);
        const doc = yield* readTrackedSessions(target);
        assert.deepStrictEqual(
          doc.cwds['/a']?.map(row => [row.sessionId, row.title]),
          [
            ['s1', 'renamed'],
            ['s2', 'two'],
          ],
        );
        assert.deepStrictEqual(
          doc.cwds['/x']?.map(row => row.sessionId),
          ['external'],
        );
      }),
    );

    testIt.effect('never overwrites a malformed file', () =>
      Effect.gen(function* () {
        store.set(file, { kind: 'file', content: '{bad' });
        const exit = yield* Effect.exit(upsertTrackedSessions(target, [{ cwd: '/a', sessionId: 's1' }]));
        assert.isTrue(Exit.isFailure(exit));
        const read = yield* Effect.flip(readTrackedSessions(target));
        assert.instanceOf(read, TrackedSessionsMalformed);
        assert.deepStrictEqual(store.get(file), { kind: 'file', content: '{bad' });
      }),
    );

    testIt.effect('removes one record and drops an emptied cwd', () =>
      Effect.gen(function* () {
        yield* upsertTrackedSessions(target, [
          { cwd: '/a', sessionId: 's1' },
          { cwd: '/a', sessionId: 's2' },
          { cwd: '/b', sessionId: 's3' },
        ]);
        yield* removeTrackedSession(target, '/a', 's1');
        yield* removeTrackedSession(target, '/b', 's3');
        const doc = yield* readTrackedSessions(target);
        assert.deepStrictEqual(Object.keys(doc.cwds), ['/a']);
        assert.deepStrictEqual(
          doc.cwds['/a']?.map(row => row.sessionId),
          ['s2'],
        );
      }),
    );

    testIt.effect('filters rows by cwd on read', () =>
      Effect.gen(function* () {
        yield* upsertTrackedSessions(target, [
          { cwd: '/a', sessionId: 's1' },
          { cwd: '/b', sessionId: 's2' },
        ]);
        const doc = yield* readTrackedSessions(target);
        assert.deepStrictEqual(
          trackedSessionRows(doc, new Set(['/b'])).map(row => row.sessionId),
          ['s2'],
        );
        assert.lengthOf(trackedSessionRows(doc), 2);
      }),
    );
  });
});
